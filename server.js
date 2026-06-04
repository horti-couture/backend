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
        const result = await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
            subject: `New Contact Form Submission from ${name}`,
            html: `
                <h2>New Contact Message</h2>
                <p><b>Name:</b> ${name}</p>
                <p><b>Email:</b> ${email}</p>
                <p><b>Message:</b><br>${message}</p>
            `,
        });

        console.log("✅ CONTACT EMAIL SENT:", result);

        res.json({ message: "Email sent successfully" });

    } catch (error) {
        console.error("❌ Contact email error:");
        console.error(error?.response || error);
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
        const result = await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
            subject: `New Booking from ${name}`,
            html: `
                <h2>New Booking</h2>
                <p><b>Service:</b> ${service}</p>
                <p><b>Date:</b> ${date}</p>
                <p><b>Time:</b> ${time}</p>
                <p><b>Name:</b> ${name}</p>
                <p><b>Email:</b> ${email}</p>
                <p><b>Phone:</b> ${phone}</p>
                <p><b>Address:</b> ${address}</p>
                <p><b>Notes:</b> ${notes || "None"}</p>
            `,
        });

        console.log("✅ BOOKING EMAIL SENT:", result);

        res.json({ message: "Booking sent" });

    } catch (error) {
        console.error("❌ Booking error:");
        console.error(error?.response || error);
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
        return `- ${item.quantity} x ${item.title}
  Color: ${item.color || "N/A"}
  Size: ${item.size || "N/A"}
  Price: R${(item.price * item.quantity).toFixed(2)}
`;
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
        const customerEmail = await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: email,
            subject: "Your Order Invoice",
            html: `<pre>${invoice}</pre>`,
        });

        const adminEmail = await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
            subject: `New Order ${transactionId}`,
            html: `<pre>${invoice}</pre>`,
        });

        console.log("✅ CHECKOUT COMPLETE:", { customerEmail, adminEmail });

        res.json({ message: "Order processed", transactionId });

    } catch (error) {
        console.error("❌ Checkout error:");
        console.error(error?.response || error);
        res.status(500).json({ error: "Checkout failed" });
    }
});

// ========================
// START SERVER
// ========================
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});