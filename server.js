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
    } catch (error) {
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
            text: `📌 Service: ${service}
📅 Date: ${date}
⏰ Time: ${time}
👤 Name: ${name}
✉️ Email: ${email}
📞 Phone: ${phone}
🏠 Address: ${address}
📝 Notes: ${notes || "No additional notes"}`,
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
    const { email, cart, total, shippingAddress } = req.body;

    if (!email || !cart || cart.length === 0 || !total || !shippingAddress) {
        return res.status(400).json({ error: "Invalid checkout request." });
    }

    const transactionId = `TXN-${Date.now()}`;
    const invoiceContent = `
    🛍️ Order Details:
    ${cart.map(item => `- ${item.quantity} x ${item.title} 
        - Color: ${item.color} 
        - Size: ${item.size} 
        - Line Art: ${item.lineArt} 
        - Stand: ${item.stand} 
        - Price: R${item.price.toFixed(2)}
    `).join("\n")}

    🧾 Total: R${total.toFixed(2)}
    📌 Transaction ID: ${transactionId}
    🏠 Shipping Address: ${shippingAddress}

    We appreciate your business!
    `;

    const orderDetails = `
    🛍️ New Order Received:
    ${cart.map(item => `- ${item.quantity} x ${item.title} 
        - Color: ${item.color} 
        - Size: ${item.size} 
        - Line Art: ${item.lineArt} 
        - Stand: ${item.stand} 
        - Price: R${item.price.toFixed(2)}
    `).join("\n")}

    🧾 Total: R${total.toFixed(2)}
    📌 Transaction ID: ${transactionId}
    🏠 Shipping Address: ${shippingAddress}
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
        transactions.push({ transactionId, email, cart, total, shippingAddress, date: new Date().toISOString() });
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
