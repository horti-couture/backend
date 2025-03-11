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

// Paystack API Keys
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

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
    if (!name || !email || !message) return res.status(400).json({ error: "All fields are required." });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `New Contact Form Submission from ${name}`,
            text: `👤 Name: ${name}\n✉️ Email: ${email}\n📝 Message:\n${message}`,
        });

        console.log("✅ Contact email sent!");
        res.status(200).json({ message: "Email sent successfully!" });
    } catch (error) {
        console.error("❌ Error sending contact email:", error);
        res.status(500).json({ error: "Failed to send email" });
    }
});

// ✅ **2. Booking Service Endpoint**
app.post("/book-service", async (req, res) => {
    const { service, date, time, name, email, phone, address, notes } = req.body;
    if (!service || !date || !time || !name || !email || !phone || !address) 
        return res.status(400).json({ error: "All required fields must be filled." });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
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

        console.log("✅ Booking email sent!");
        res.status(200).json({ message: "Booking request sent successfully!" });
    } catch (error) {
        console.error("❌ Error sending booking email:", error);
        res.status(500).json({ error: "Failed to send booking request." });
    }
});

// ✅ **3. Initialize Paystack Payment**
app.post("/initialize-payment", async (req, res) => {
    const { email, amount } = req.body;
    try {
        const response = await axios.post(
            "https://api.paystack.co/transaction/initialize",
            { email, amount: amount * 100, currency: "ZAR" },
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );
        res.json(response.data);
    } catch (error) {
        console.error("❌ Error initializing payment:", error);
        res.status(500).json({ error: "Payment initialization failed." });
    }
});

// ✅ **4. Verify Paystack Transaction**
app.get("/verify-payment/:reference", async (req, res) => {
    try {
        const response = await axios.get(
            `https://api.paystack.co/transaction/verify/${req.params.reference}`,
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );
        res.json(response.data);
    } catch (error) {
        console.error("❌ Error verifying payment:", error);
        res.status(500).json({ error: "Verification failed." });
    }
});

// ✅ **5. Checkout & Send Invoice**
app.post("/checkout", async (req, res) => {
    const { email, cart, total, shippingAddress, name, phone, shippingMethod, paymentMethod } = req.body;
    if (!email || !cart || cart.length === 0 || !total || !shippingAddress || !name || !phone) 
        return res.status(400).json({ error: "Invalid checkout request." });

    const transactionId = `TXN-${Date.now()}`;
    const extras = cart.map(item => {
        let extrasList = [];
        if (item.lineArt) extrasList.push("Line Art");
        if (item.stand) extrasList.push("Wooden Stand");
        return extrasList.length > 0 ? `(${extrasList.join(", ")})` : "";
    });

    const invoiceContent = `
    Hello ${name},

    🛍️ Thank you for your order! Here is your order summary:

    ${cart.map((item, index) => `- ${item.quantity} x ${item.title} ${extras[index]}
        - Color: ${item.color}
        - Size: ${item.size}
        - Price: R${item.price.toFixed(2)}
    `).join("\n")}

    🚚 Shipping Method: ${shippingMethod} ${shippingMethod === "courier" ? "(+R120)" : ""}
    💰 Payment Method: ${paymentMethod}
    🏠 Shipping Address: ${shippingAddress}
    📞 Contact: ${phone}

    🧾 Total: R${total.toFixed(2)}
    📌 Transaction ID: ${transactionId}

    Best regards,  
    Horti Couture Team
    `;

    try {
        // Send invoice to customer
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "🧾 Your Order Confirmation - Horti Couture",
            text: invoiceContent,
        });

        // Send order details to admin
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `🛍️ New Order Received (${transactionId})`,
            text: invoiceContent,
        });

        console.log("✅ Invoice & order details emails sent!");

        // Store transaction
        let transactions = [];
        const filePath = "./transactions.json";
        if (fs.existsSync(filePath)) {
            transactions = JSON.parse(fs.readFileSync(filePath));
        }
        transactions.push({ transactionId, email, cart, total, shippingAddress, name, phone, shippingMethod, paymentMethod, date: new Date().toISOString() });
        fs.writeFileSync(filePath, JSON.stringify(transactions, null, 2));

        res.status(200).json({ message: "Invoice sent!", transactionId });

        // Redirect to home after transaction
        setTimeout(() => { res.redirect("/"); }, 3000);
    } catch (error) {
        console.error("❌ Error processing checkout:", error);
        res.status(500).json({ error: "Failed to process checkout." });
    }
});

// ✅ **6. Start Server**
app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
});
