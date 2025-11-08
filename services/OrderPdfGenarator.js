import PDFDocument from "pdfkit";
import moment from "moment";

const generateInvoice = async (order, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      // Collect PDF chunks in memory
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // ---------- Brand Header ----------
      doc
        .fontSize(22)
        .font("Helvetica-Bold")
        .text(" Dité", { align: "center" })
        .moveDown(0.5);

      doc
        .fontSize(11)
        .font("Helvetica-Oblique")
        .text(
          "Where timeless elegance meets modern masculinity. Explore our exclusive range of perfumes including Sauvage, Homme Parfum, and Fahrenheit.",
          { align: "center" }
        )
        .moveDown(1);

      // ---------- Company Info ----------
      doc
        .font("Helvetica")
        .fontSize(12)
        .text("MyShop Pvt Ltd", 50, doc.y)
        .text("123 Main Street, Kochi, Kerala")
        .text("Email: support@myshop.com")
        .moveDown(1.2);  // Slightly more space for consistency

      // ---------- Invoice & Customer Info ----------
      const address = order.address || {};
      const shippingAddressLines = [];  // Split address to avoid run-on lines
      if (address.fullName) shippingAddressLines.push(address.fullName);
      if (address.hoNo) shippingAddressLines.push(address.hoNo);
      if (address.street) shippingAddressLines.push(address.street);
      if (address.city) shippingAddressLines.push(address.city);
      if (address.state) shippingAddressLines.push(address.state);
      if (address.pin) shippingAddressLines.push(address.pin);
      if (address.country) shippingAddressLines.push(address.country);
      shippingAddressLines.push(`Ph: ${address.phone || "N/A"}`);
      const shippingAddress = shippingAddressLines.join(", ") || "No address available";

      doc
        .font("Helvetica-Bold")
        .text(`Invoice No: INV-${order._id}`)
        .font("Helvetica")
        .text(`Order ID: ${order.orderID}`)
        .text(`Order Date: ${moment(order.createdAt).format("DD-MM-YYYY")}`)
        .text(`Payment Method: ${order.paymentMethod.toUpperCase()}`)
        .text(`Order Status: ${order.orderStatus}`)
        .text(`Cancel Status: ${order.cancelStatus}`)
        .moveDown(0.5)
        .font("Helvetica-Bold")
        .text("Billed To:")
        .font("Helvetica")
        .text(shippingAddress)
        .moveDown(0.8);  // Added breathing room before table

      // ---------- Product Table Header ----------
      const headerY = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("Product", 50, headerY, { width: 190, align: "left" })
        .text("Qty", 250, headerY, { width: 40, align: "center" })
        .text("Base Price", 300, headerY, { width: 80, align: "center" })
        .text("Discounted", 390, headerY, { width: 80, align: "center" })
        .text("Total", 480, headerY, { width: 70, align: "right" });

      // Draw table borders for better alignment
      doc
        .moveTo(50, headerY - 5).lineTo(550, headerY - 5).stroke()  // Top line
        .moveTo(50, headerY + 15).lineTo(550, headerY + 15).stroke();  // Bottom line under header
      [50, 250, 300, 390, 480, 550].forEach(x => {
        doc.moveTo(x, headerY - 5).lineTo(x, headerY + 15).stroke();  // Vertical lines
      });

      doc.moveDown(1.2);  // Space after header

      // ---------- Product Rows ----------
      doc.font("Helvetica").fontSize(9);
      order.items.forEach((item) => {
        const productName = `${item.name} (${item.mlSize}ml)`;
        // Reverted to match data schema: discoundedPrice (as in original code)
        const discountedPrice = item.discoundedPrice || 0;
        const itemTotal = discountedPrice * item.quantity;
        const basePrice = item.basePrice || 0;
        const rowY = doc.y;  // Track starting Y for this row

        // Product name with wrapping and fixed width
        doc.text(productName, 50, rowY, { width: 190, align: "left" });

        // Calculate height of wrapped product name to align other columns
        const productHeight = doc.heightOfString(productName, { width: 190 });

        // Align other columns to the baseline (end) of the product text
        const baselineY = rowY + productHeight;

        doc
          .text(item.quantity?.toString() || '0', 250, baselineY - productHeight + 2, { width: 40, align: "center" })
          .text(`Rs. ${basePrice.toLocaleString()}`, 300, baselineY - productHeight + 2, { width: 80, align: "right" })
          .text(`Rs. ${discountedPrice.toLocaleString()}`, 390, baselineY - productHeight + 2, { width: 80, align: "right" })
          .text(`Rs. ${itemTotal.toLocaleString()}`, 480, baselineY - productHeight + 2, { width: 70, align: "right" });

        // Draw row separator line
        doc.moveTo(50, baselineY + 2).lineTo(550, baselineY + 2).stroke();

        doc.y = baselineY + 8;  // Advance Y based on content height + consistent padding
      });

      doc.moveDown(1);  // Space before summary

      // ---------- Summary (Right-aligned with fixed positions) ----------
      const summaryStartY = doc.y;
      const summaryX = 350;  // Right section start
      const summaryWidth = 200;

      const subTotal = order.items.reduce(
        (acc, ele) => acc + (ele.basePrice || 0) * (ele.quantity || 0),
        0
      );
      const totalDiscount =
        subTotal -
        order.items.reduce(
          (acc, ele) => acc + (ele.discoundedPrice || 0) * (ele.quantity || 0),
          0
        );
      const totalAmount = order.items.reduce(
        (acc, ele) => acc + (ele.discoundedPrice || 0) * (ele.quantity || 0),
        0
      );

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(`Subtotal: Rs. ${subTotal.toLocaleString()}`, summaryX, summaryStartY, { align: "right", width: summaryWidth })
        .text(`Discount: Rs. ${totalDiscount.toLocaleString()}`, summaryX, summaryStartY + 15, { align: "right", width: summaryWidth })
        .text(`Grand Total: Rs. ${totalAmount.toLocaleString()}`, summaryX, summaryStartY + 30, { align: "right", width: summaryWidth })
        .moveDown(1.5);  // Tighter spacing to footer

      // ---------- Footer ----------
      doc
        .font("Helvetica-Oblique")
        .fontSize(11)
        .text("Thank you for shopping with Dior Fragrance Store!", { align: "center" })
        .moveDown(0.3)
        .text("Follow us on Instagram @diorbeauty for exclusive offers.", {
          align: "center",
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

export default generateInvoice;