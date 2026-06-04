require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Resend } = require("resend");

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
console.log("Resend Key Loaded:", process.env.RESEND_API_KEY ? "YES" : "NO");

// ========================
// Paystack Keys
// ========================
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ========================
// Resend Setup
// ========================
const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = "horticouturesa@gmail.com";

// ========================
// ROOT TEST ROUTE
// ========================
app.get("/", (req, res) => {
    res.send("✅ Horti Couture Backend is running");
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
        await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
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
        await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
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
        // Customer email
        await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: email,
            subject: "Your Order Invoice",
            text: invoice,
        });

        // Admin email
        await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
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