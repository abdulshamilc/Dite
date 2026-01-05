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
      const dangerColor = "#c0392b"; // RED for Returned & Cancelled

      const drawLine = (y) => {
        doc.moveTo(50, y).lineTo(545, y).strokeColor(lineColor).stroke();
      };

      // --- 1. Header Section ---
      const logoPath = path.join(process.cwd(), "public", "images", "logo", "DiteLogo.png");
      try {
        doc.image(logoPath, 50, 45, { width: 60 });
      } catch {
        doc.fontSize(24).font("Helvetica-Bold").text("Dité", 50, 50);
      }

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

      // --- 2. Invoice Details ---
      doc.fontSize(20).font("Helvetica-Bold").text("INVOICE", 50, invoiceTopY);

      doc.fontSize(10);
      let infoY = invoiceTopY + 35;
      const spacing = 18;

      doc.font("Helvetica-Bold").text("Invoice No:", 50, infoY);
      doc.font("Helvetica").text(`INV-${order.orderID || order._id.toString().slice(-6)}`, 120, infoY);

      infoY += spacing;
      doc.font("Helvetica-Bold").text("Date:", 50, infoY);
      doc.font("Helvetica").text(moment(order.createdAt).format("DD MMM YYYY"), 120, infoY);

      infoY += spacing;
      doc.font("Helvetica-Bold").text("Status:", 50, infoY);
      doc.font("Helvetica").text(order.orderStatus, 120, infoY);

      // Bill To
      let billY = invoiceTopY + 35;
      const address = order.address || {};

      doc.font("Helvetica-Bold").text("Bill To:", 350, billY);
      billY += spacing;

      doc.font("Helvetica");
      doc.text(address.fullName || "Valued Customer", 350, billY);
      billY += 15;
      if (address.street) {
        doc.text(address.street, 350, billY);
        billY += 15;
      }
      if (address.city || address.state) {
        doc.text(`${address.city || ""}, ${address.state || ""}`, 350, billY);
        billY += 15;
      }
      if (address.pin) {
        doc.text(`PIN: ${address.pin}`, 350, billY);
      }

      // --- 3. Product Merge ---
      let allItems = [];

      order.items?.forEach(item => {
        const isReturned = order.returndProduct?.some(
          rp =>
            rp.productId.toString() === item.productId.toString() &&
            rp.mlSize === item.mlSize &&
            rp.adminApproved === "Approved"
        );

        allItems.push({
          name: item.name,
          mlSize: item.mlSize,
          quantity: item.quantity,
          price: item.discountedPrice || item.basePrice || 0,
          status: isReturned ? "Returned" : "Active"
        });
      });

      order.cancelProducts?.forEach(cp => {
        allItems.push({
          name: cp.name,
          mlSize: cp.mlSize,
          quantity: cp.canceledQuantity,
          price: cp.discountedPrice || cp.basePrice || 0,
          status: "Cancelled"
        });
      });

      allItems.sort((a, b) => ({ Active: 1, Returned: 2, Cancelled: 3 }[a.status] - { Active: 1, Returned: 2, Cancelled: 3 }[b.status]));

      // --- 4. Table ---
      const tableTop = Math.max(billY, infoY) + 30;
      const col = [50, 80, 300, 360, 430, 500];

      doc.rect(50, tableTop, 495, 25).fill(tableHeaderBg);
      doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");

      ["#", "Item", "Qty", "Status", "Price", "Total"].forEach((t, i) => {
        doc.text(t, col[i], tableTop + 8);
      });

      let y = tableTop + 35;
      let calculatedSubTotal = 0;

      doc.font("Helvetica").fontSize(9);

      allItems.forEach((item, i) => {
        const lineTotal = item.price * item.quantity;
        if (item.status !== "Cancelled") calculatedSubTotal += lineTotal;

        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        if (item.status !== "Active") doc.fillColor(dangerColor);
        else doc.fillColor(primaryColor);

        doc.text(i + 1, col[0], y);
        doc.text(`${item.name} (${item.mlSize}ml)`, col[1], y, { width: 200 });
        doc.text(item.quantity, col[2], y);
        doc.text(item.status, col[3], y);
        doc.fillColor(primaryColor);
        doc.text(`Rs.${item.price}`, col[4], y);
        doc.text(item.status === "Cancelled" ? "0" : `Rs.${lineTotal}`, col[5], y);

        y += 25;
        drawLine(y - 5);
      });

      // --- FIX: SAFE SPACE BEFORE SUMMARY ---
      if (y > 620) {
        doc.addPage();
        y = 50;
      } else {
        y += 30;
      }

      // --- 5. Summary ---
      const rightMargin = 545;
      const colWidth = 100;
      const valueX = rightMargin - colWidth; // 445
      const labelX = valueX - colWidth - 10; // 335

      const printSummaryRow = (label, value, isBold = false) => {
          if (isBold) doc.font("Helvetica-Bold");
          else doc.font("Helvetica");
          
          doc.text(label, labelX, y, { width: colWidth, align: "right" });
          doc.text(value, valueX, y, { width: colWidth, align: "right" });
          y += 20;
      };

      printSummaryRow("Subtotal:", `Rs.${calculatedSubTotal.toFixed(2)}`);

      if (order.discountAmount) {
        printSummaryRow("Discount:", `-Rs.${order.discountAmount.toFixed(2)}`);
      }

      printSummaryRow("Delivery:", `Rs.${(order.deliveryCharge || 0).toFixed(2)}`);
      
      if (order.tax) {
        printSummaryRow("Tax:", `Rs.${order.tax.toFixed(2)}`);
      }

      drawLine(y);
      y += 10;

      printSummaryRow("Grand Total:", `Rs.${(order.totalAmount || 0).toFixed(2)}`, true);

      // --- 6. Footer ---
      const bottomY = doc.page.height - 60;
      drawLine(bottomY);

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Thank you for choosing Dité!", 50, bottomY + 15, { align: "center", width: 495 });

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(secondaryColor)
        .text("For support: support@dite.com", 50, bottomY + 30, { align: "center", width: 495 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

export default generateInvoice;
