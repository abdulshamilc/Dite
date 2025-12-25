import PDFDocument from "pdfkit";
import moment from "moment";
import path from "path";

const generateInvoice = async (order, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // Colors & Styling
      const primaryColor = "#333333";
      const secondaryColor = "#555555";
      const tableHeaderBg = "#f4f4f4";
      const lineColor = "#e0e0e0";

      // Helper to draw horizontal line
      const drawLine = (y) => {
        doc.moveTo(50, y).lineTo(545, y).strokeColor(lineColor).stroke();
      };

      // --- 1. Header Section ---
      
      // Logo
      const logoPath = path.join(process.cwd(), "public", "images", "logo", "DiteLogo.png");
      try {
        doc.image(logoPath, 50, 45, { width: 60 });
      } catch (e) {
        doc
          .fillColor("#000000")
          .fontSize(24)
          .font("Helvetica-Bold")
          .text("Dité", 50, 50);
      }

      // Company Info (Top Right)
      doc
        .fillColor(primaryColor)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Dité Pvt Ltd", 400, 50, { align: "right" })
        .font("Helvetica")
        .text("123 Main Street", 400, 65, { align: "right" })
        .text("Kochi, Kerala, 682001", 400, 80, { align: "right" })
        .text("support@dite.com", 400, 95, { align: "right" });

      const invoiceTopY = 140;
      drawLine(invoiceTopY - 20);

      // --- 2. Invoice Details & Bill To ---
      
      doc
        .fillColor(primaryColor)
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("INVOICE", 50, invoiceTopY);

      // Left Column: Invoice Info
      doc.fontSize(10);
      
      const labelX = 50;
      const valueX = 120;
      let infoY = invoiceTopY + 35;
      const spacing = 18;

      doc.font("Helvetica-Bold").text("Invoice No:", labelX, infoY);
      doc.font("Helvetica").text(`INV-${order.orderID || order._id.toString().slice(-6).toUpperCase()}`, valueX, infoY);
      
      infoY += spacing;
      doc.font("Helvetica-Bold").text("Date:", labelX, infoY);
      doc.font("Helvetica").text(moment(order.createdAt).format("DD MMMM YYYY"), valueX, infoY);
      
      infoY += spacing;
      doc.font("Helvetica-Bold").text("Status:", labelX, infoY);
      doc.font("Helvetica").text(order.orderStatus, valueX, infoY);

      // Right Column: Bill To
      const billToX = 350;
      let billY = invoiceTopY + 35;

      doc.font("Helvetica-Bold").text("Bill To:", billToX, billY);
      billY += spacing;
      
      doc.font("Helvetica");
      const address = order.address || {};
      
      doc.text(address.fullName || "Valued Customer", billToX, billY);
      billY += 15; // Tighter line height for address
      
      if(address.hoNo || address.street) {
        doc.text(`${address.hoNo || ""} ${address.street || ""}`.trim(), billToX, billY);
        billY += 15;
      }
      
      if(address.city || address.state) {
        doc.text(`${address.city || ""}, ${address.state || ""}`, billToX, billY);
        billY += 15;
      }
      
      if(address.country || address.pin) {
        doc.text(`${address.country || ""} - ${address.pin || ""}`, billToX, billY);
        billY += 15;
      }
      
      if(address.phone) {
        doc.text(`Ph: ${address.phone}`, billToX, billY);
      }

      // --- 3. Build Product List (Merger) ---
      let allItems = [];

      // A. Active Items
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
           // check if returned
           const isReturned = order.returndProduct && order.returndProduct.some(
             rp => rp.productId.toString() === item.productId.toString() && rp.mlSize === item.mlSize && rp.adminApproved === 'Approved'
           );
           
           allItems.push({
             name: item.name,
             mlSize: item.mlSize,
             quantity: item.quantity,
             price: item.discoundedPrice || item.discountedPrice || item.basePrice || 0,
             status: isReturned ? 'Returned' : 'Active', 
           });
        });
      }

      // B. Cancelled Items
      if (order.cancelProducts && order.cancelProducts.length > 0) {
        order.cancelProducts.forEach(cp => {
          allItems.push({
             name: cp.name,
             mlSize: cp.mlSize,
             quantity: cp.canceledQuantity,
             price: cp.discountedPrice || cp.basePrice || 0,
             status: 'Cancelled'
          });
        });
      }

      // Sort: Active first, then Returned, then Cancelled
      allItems.sort((a, b) => {
         const order = { 'Active': 1, 'Returned': 2, 'Cancelled': 3 };
         return (order[a.status] || 99) - (order[b.status] || 99);
      });

      // --- 4. Product Table ---
      const tableTop = Math.max(billY, infoY) + 30;
      
      const col1 = 50;  // #
      const col2 = 80;  // Item
      const col3 = 300; // Qty
      const col4 = 360; // Status
      const col5 = 430; // Price
      const col6 = 500; // Total

      // Header Background
      doc.rect(50, tableTop, 495, 25).fill(tableHeaderBg);

      // Header Text
      doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");
      doc.text("#", col1 + 5, tableTop + 8);
      doc.text("Item Description", col2, tableTop + 8);
      doc.text("Qty", col3, tableTop + 8, { align: "center", width: 40 });
      doc.text("Status", col4, tableTop + 8, { align: "center", width: 60 });
      doc.text("Price", col5, tableTop + 8, { align: "right", width: 60 });
      doc.text("Total", col6, tableTop + 8, { align: "right", width: 45 });

      let y = tableTop + 35;
      let calculatedSubTotal = 0;

      doc.font("Helvetica").fontSize(9);

      allItems.forEach((item, i) => {
         const price = item.price;
         const qty = item.quantity;
         const lineTotal = price * qty;
         
         // Calculate Subtotal (Active and Returned usually count towards initial invoice value)
         if (item.status === 'Active' || item.status === 'Returned') {
            calculatedSubTotal += lineTotal;
         }

         const name = item.name || "Product";
         const variant = item.mlSize ? `${item.mlSize}ml` : "";
         const fullName = `${name} (${variant})`;

         // Calculate Dynamic Height
         const textWidth = 210;
         const textHeight = doc.heightOfString(fullName, { width: textWidth });
         const rowHeight = Math.max(textHeight, 15) + 10;

         // Check Page Break
         if (y + rowHeight > 700) {
            doc.addPage();
            y = 50;
         }

         // Status Color
         if (item.status === 'Cancelled') doc.fillColor("red");
         else if (item.status === 'Returned') doc.fillColor("orange");
         else doc.fillColor(primaryColor);

         doc.text(((i + 1).toString()), col1 + 5, y);
         
         doc.text(fullName, col2, y, { width: textWidth });
         doc.text(qty.toString(), col3, y, { align: "center", width: 40 });
         doc.text(item.status, col4, y, { align: "center", width: 60 });
         
         doc.fillColor(primaryColor); // Reset for numbers
         
         doc.text(`Rs.${price.toLocaleString()}`, col5, y, { align: "right", width: 60 });
         
         const displayTotal = item.status === 'Cancelled' ? '0' : `Rs.${lineTotal.toLocaleString()}`;
         doc.text(displayTotal, col6, y, { align: "right", width: 45 });

         y += rowHeight;
         
         // Row Divider
         doc.moveTo(50, y - 5).lineTo(545, y - 5).strokeColor("#f9f9f9").stroke();
      });
      
      if (allItems.length === 0) {
         doc.text("No items found.", 50, y);
         y += 20;
      }

      y += 20;

      // --- 5. Summary ---
      if (y > 650) {
        doc.addPage();
        y = 50;
      }

      const summaryLabelX = 350;
      const summaryValueX = 460;
      const summaryWidth = 85;
      const lineHeight = 18;

      doc.fontSize(10).font("Helvetica");

      // Grand Total logic
      const safeTotal = order.totalAmount || 0;
      
      // Attempt to deduce shipping/discount
      // If we assume calculatedSubTotal is the pure product cost
      const diff = safeTotal - calculatedSubTotal;

      doc.text("Subtotal:", summaryLabelX, y, { align: "right" });
      doc.text(`Rs. ${calculatedSubTotal.toLocaleString()}`, summaryValueX, y, { align: "right", width: summaryWidth });
      y += lineHeight;

      if (Math.abs(diff) > 1) { // Ignore tiny float errors
         const label = diff > 0 ? "Shipping / Logic:" : "Discount:";
         doc.text(label, summaryLabelX, y, { align: "right" });
         doc.text(`Rs. ${diff.toLocaleString()}`, summaryValueX, y, { align: "right", width: summaryWidth });
         y += lineHeight;
      }

      drawLine(y); 
      y += 10;

      doc.fontSize(12).font("Helvetica-Bold");
      doc.text("Grand Total:", summaryLabelX, y, { align: "right" });
      doc.text(`Rs. ${safeTotal.toLocaleString()}`, summaryValueX, y, { align: "right", width: summaryWidth });


      // --- 6. Footer ---
      const pageHeight = doc.page.height;
      if (y > pageHeight - 100) doc.addPage();
      
      const bottomY = doc.page.height - 60;
      
      doc.moveTo(50, bottomY).lineTo(545, bottomY).strokeColor(lineColor).stroke();
      
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text("Thank you for choosing Dité!", 50, bottomY + 15, { align: "center", width: 495 });
      
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(secondaryColor)
        .text("For support, please contact us at support@dite.com", 50, bottomY + 30, { align: "center", width: 495 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

export default generateInvoice;