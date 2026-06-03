require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

// ========================
// Middleware
// ========================
app.use(express.json());
app.use(cors());

// ========================
// Debug Logs
// ========================
console.log("Loaded Email:", process.env.EMAIL_USER);
console.log("Password Status:", process.env.EMAIL_PASS ? "Loaded" : "Not Loaded");

// ========================
// Paystack Keys
// ========================
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ========================
// ROOT TEST ROUTE (fixes Cannot GET /)
// ========================
app.get("/", (req, res) => {
    res.send("✅ Horti Couture Backend is running");
});

// ========================
// Nodemailer (FIXED SMTP CONFIG)
// ========================
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 30000,
    socketTimeout: 30000,
});

// ========================
// SMTP STARTUP TEST (VERY IMPORTANT)
// ========================
transporter.verify((error, success) => {
    if (error) {
        console.error("❌ SMTP ERROR:", error);
    } else {
        console.log("✅ SMTP READY - Gmail connected successfully");
    }
});

// ========================
// 1. CONTACT EMAIL
// ========================
app.post("/send-email", async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `New Contact Form Submission from ${name}`,
            text: `Name: ${name}\nEmail: ${email}\nMessage:\n${message}`,
        });

        console.log("✅ Contact email sent");
        res.json({ message: "Email sent successfully" });
    } catch (error) {
        console.error("❌ Contact email error:", error);
        res.status(500).json({ error: "Email failed" });
    }
});

// ========================
// 2. BOOKING EMAIL
// ========================
app.post("/book-service", async (req, res) => {
    const { service, date, time, name, email, phone, address, notes } = req.body;

    if (!service || !date || !time || !name || !email || !phone || !address) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `New Booking from ${name}`,
            text:
                `Service: ${service}\n` +
                `Date: ${date}\nTime: ${time}\n` +
                `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n` +
                `Address: ${address}\nNotes: ${notes || "None"}`,
        });

        console.log("✅ Booking email sent");
        res.json({ message: "Booking sent" });
    } catch (error) {
        console.error("❌ Booking error:", error);
        res.status(500).json({ error: "Booking failed" });
    }
});

// ========================
// 3. PAYSTACK INIT
// ========================
app.post("/initialize-payment", async (req, res) => {
    const { email, amount } = req.body;

    try {
        const response = await axios.post(
            "https://api.paystack.co/transaction/initialize",
            {
                email,
                amount: amount * 100,
                currency: "ZAR",
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                },
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error("❌ Paystack init error:", error.response?.data || error);
        res.status(500).json({ error: "Payment init failed" });
    }
});

// ========================
// 4. PAYSTACK VERIFY
// ========================
app.get("/verify-payment/:reference", async (req, res) => {
    try {
        const response = await axios.get(
            `https://api.paystack.co/transaction/verify/${req.params.reference}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                },
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error("❌ Verify error:", error.response?.data || error);
        res.status(500).json({ error: "Verification failed" });
    }
});

// ========================
// 5. CHECKOUT + INVOICE
// ========================
app.post("/checkout", async (req, res) => {
    const { name, email, cart, total, address, shippingOption, paymentMethod } = req.body;

    if (!name || !email || !cart || cart.length === 0 || !total || !address || !shippingOption) {
        return res.status(400).json({ error: "Invalid checkout request" });
    }

    const transactionId = `TXN-${Date.now()}`;
    const shippingFee = shippingOption === "courier" ? 120 : 0;
    const grandTotal = total + shippingFee;

    const formatItem = (item) => {
        return (
            `- ${item.quantity} x ${item.title}\n` +
            `  Color: ${item.color || "N/A"}\n` +
            `  Size: ${item.size || "N/A"}\n` +
            `  Price: R${(item.price * item.quantity).toFixed(2)}\n`
        );
    };

    const invoice = `
🛍️ ORDER INVOICE
Customer: ${name}

${cart.map(formatItem).join("\n")}

Shipping: ${shippingOption}
Subtotal: R${total.toFixed(2)}
Shipping Fee: R${shippingFee.toFixed(2)}
TOTAL: R${grandTotal.toFixed(2)}

Transaction ID: ${transactionId}
Address: ${address}
Payment: ${paymentMethod}
`;

    try {
        // customer email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your Order Invoice",
            text: invoice,
        });

        // admin email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `New Order ${transactionId}`,
            text: invoice,
        });

        console.log("✅ Checkout complete");
        res.json({ message: "Order processed", transactionId });
    } catch (error) {
        console.error("❌ Checkout error:", error);
        res.status(500).json({ error: "Checkout failed" });
    }
});

// ========================
// START SERVER
// ========================
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});