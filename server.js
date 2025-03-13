require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const fs = require("fs");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(cors());

// Debugging Logs
console.log("Loaded Email:", process.env.EMAIL_USER);
console.log("Password Status:", process.env.EMAIL_PASS ? "Loaded" : "Not Loaded");

// Paystack API Keys from Environment Variables
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ✅ **1. Contact Form Endpoint**
app.post("/send-email", async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Send to your email
            subject: `New Contact Form Submission from ${name}`,
            text: `👤 Name: ${name}\n✉️ Email: ${email}\n📝 Message:\n${message}`,
        });

        console.log("✅ Contact email sent successfully!");
        res.status(200).json({ message: "Email sent successfully!" });
    } catch ( error) {
        console.error("❌ Error sending contact email:", error);
        res.status(500).json({ error: "Failed to send email" });
    }
});

// ✅ **2. Booking Service Endpoint**
app.post("/book-service", async (req, res) => {
    const { service, date, time, name, email, phone, address, notes } = req.body;

    if (!service || !date || !time || !name || !email || !phone || !address) {
        return res.status(400).json({ error: "All required fields must be filled." });
    }

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Send to your email
            subject: `📝 New Booking Request from ${name}`,
            text: `📌 Service: ${service}\n📅 Date: ${date}\n⏰ Time: ${time}\n👤 Name: ${name}\n✉️ Email: ${email}\n📞 Phone: ${phone}\n🏠 Address: ${address}\n📝 Notes: ${notes || "No additional notes"}`,
        });

        console.log("✅ Booking email sent successfully!");
        res.status(200).json({ message: "Booking request sent successfully!" });
    } catch (error) {
        console.error("❌ Error sending booking email:", error);
        res.status(500).json({ error: "Failed to send booking request" });
    }
});

// ✅ **3. Initialize Paystack Payment**
app.post("/initialize-payment", async (req, res) => {
    const { email, amount } = req.body;

    try {
        const response = await axios.post(
            "https://api.paystack.co/transaction/initialize",
            { email, amount: amount * 100, currency: "ZAR" }, // Convert amount to kobo
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );

        res.json(response.data);
    } catch (error) {
        console.error("❌ Error initializing payment:", error);
        res.status(500).json({ error: error.response?.data?.message || "Payment initialization failed" });
    }
});

// ✅ **4. Verify Paystack Transaction**
app.get("/verify-payment/:reference", async (req, res) => {
    try {
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${req.params.reference}`, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        });

        res.json(response.data);
    } catch (error) {
        console.error("❌ Error verifying payment:", error);
        res.status(500).json({ error: "Verification failed" });
    }
});

// ✅ **5. Checkout & Send Invoice**
app.post("/checkout", async (req, res) => {
    const { email, cart, total, shippingAddress, shippingOption, paymentMethod } = req.body;

    if (!email || !cart || cart.length === 0 || !total || !shippingAddress || !shippingOption || !paymentMethod) {
        return res.status(400).json({ error: "Invalid checkout request." });
    }

    const transactionId = `TXN-${Date.now()}`;
    const shippingFee = shippingOption === "courier" ? 120 : 0;
    const grandTotal = total + shippingFee;

    // Helper function to generate item details
    const generateItemDetails = (item) => {
        let details = `    - ${item.quantity} x ${item.title}\n`; // Use item.quantity instead of hardcoded '1'
        details += `    - Color: ${item.color || "N/A"}\n`;
        if (item.size) details += `    - Size: ${item.size}\n`;
        if (item.lineArt && item.lineArt !== "Plain") details += `    - Line Art: ${item.lineArt}\n`;
        if (item.stand && item.stand !== "No Stand") details += `    - Stand: ${item.stand}\n`;
        details += `    - Price: R${(item.price * item.quantity).toFixed(2)}\n`; // Calculate total price for the item
        return details;
    };

    // Generate invoice content
    const invoiceContent = `
🛍️ Order Details:
${cart.map((item) => generateItemDetails(item)).join("\n")}

🚚 Shipping Option: ${shippingOption === "courier" ? "Courier (R120)" : "Pickup from Factory"}
🧾 Subtotal: R${total.toFixed(2)}
🧾 Shipping Fee: R${shippingFee.toFixed(2)}
🧾 Grand Total: R${grandTotal.toFixed(2)}
📌 Transaction ID: ${transactionId}
🏠 Shipping Address: ${shippingAddress}
💳 Payment Method: ${paymentMethod === "paystack" ? "Paystack" : "EFT"}

We appreciate your business!
    `;

    // Generate order details for admin
    const orderDetails = `
🛍️ New Order Received:
${cart.map((item) => generateItemDetails(item)).join("\n")}

🚚 Shipping Option: ${shippingOption === "courier" ? "Courier (R120)" : "Pickup from Factory"}
🧾 Subtotal: R${total.toFixed(2)}
🧾 Shipping Fee: R${shippingFee.toFixed(2)}
🧾 Grand Total: R${grandTotal.toFixed(2)}
📌 Transaction ID: ${transactionId}
🏠 Shipping Address: ${shippingAddress}
💳 Payment Method: ${paymentMethod === "paystack" ? "Paystack" : "EFT"}
✉️ Customer Email: ${email}
    `;

    try {
        // Send invoice to the customer
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email, // Send invoice to customer
            subject: "🧾 Your Invoice from Our Store",
            text: invoiceContent,
        });

        // Send order details to the admin
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Send order details to admin
            subject: `🛍️ New Order Received (${transactionId})`,
            text: orderDetails,
        });

        console.log("✅ Invoice and order details emails sent successfully!");

        // Store transaction data in an array (temporary solution)
        let transactions = [];
        const filePath = "./transactions.json";
        if (fs.existsSync(filePath)) {
            transactions = JSON.parse(fs.readFileSync(filePath));
        }
        transactions.push({ transactionId, email, cart, total, shippingAddress, shippingOption, paymentMethod, date: new Date().toISOString() });
        fs.writeFileSync(filePath, JSON.stringify(transactions, null, 2));

        res.status(200).json({ message: "Invoice sent!", transactionId });
    } catch (error) {
        console.error("❌ Error processing checkout:", error);
        res.status(500).json({ error: "Failed to process checkout." });
    }
});

// ✅ **6. Start Server**
app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
});