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
// Debug
// ========================
console.log("Resend Loaded:", !!process.env.RESEND_API_KEY);
console.log("Paystack Loaded:", !!process.env.PAYSTACK_SECRET_KEY);

// ========================
// Services
// ========================
const resend = new Resend(process.env.RESEND_API_KEY);
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// 🔥 ALWAYS SAFE ADMIN EMAIL
const ADMIN_EMAIL = "thornhill_mt@hotmail.co.uk";

// ========================
// ROOT
// ========================
app.get("/", (req, res) => {
    res.send("✅ Horti Couture Backend is running");
});

// ======================================================
// 1. CONTACT EMAIL
// ======================================================
app.post("/send-email", async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        const result = await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
            subject: `Contact Form - ${name}`,
            html: `
                <h2>New Contact Message</h2>
                <p><b>Name:</b> ${name}</p>
                <p><b>Email:</b> ${email}</p>
                <p><b>Message:</b><br>${message}</p>
            `,
        });

        console.log("✅ CONTACT EMAIL SENT:", result);
        res.json({ success: true });

    } catch (err) {
        console.error("❌ CONTACT ERROR:", err);
        res.status(500).json({ error: "Contact failed" });
    }
});

// ======================================================
// 2. BOOKING EMAIL
// ======================================================
app.post("/book-service", async (req, res) => {
    const { service, date, time, name, email, phone, address, notes } = req.body;

    if (!service || !date || !time || !name || !email || !phone || !address) {
        return res.status(400).json({ error: "Missing booking fields" });
    }

    try {
        const result = await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
            subject: `Booking - ${name}`,
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
        res.json({ success: true });

    } catch (err) {
        console.error("❌ BOOKING ERROR:", err);
        res.status(500).json({ error: "Booking failed" });
    }
});

// ======================================================
// 3. PAYSTACK INIT
// ======================================================
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

    } catch (err) {
        console.error("❌ PAYSTACK INIT ERROR:", err.response?.data || err);
        res.status(500).json({ error: "Payment init failed" });
    }
});

// ======================================================
// 4. PAYSTACK VERIFY
// ======================================================
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

    } catch (err) {
        console.error("❌ VERIFY ERROR:", err.response?.data || err);
        res.status(500).json({ error: "Verification failed" });
    }
});

// ======================================================
// 5. CHECKOUT (BULLETPROOF FIXED VERSION)
// ======================================================
app.post("/checkout", async (req, res) => {
    const { name, email, cart, total, address, shippingOption, paymentMethod } = req.body;

    console.log("🧾 CHECKOUT RECEIVED:", req.body);

    if (!name || !Array.isArray(cart) || cart.length === 0 || !total || !address || !shippingOption) {
        return res.status(400).json({ error: "Invalid checkout request" });
    }

    const safeEmail =
        email && email.trim().length > 0
            ? email
            : null;

    const transactionId = `TXN-${Date.now()}`;
    const shippingFee = shippingOption === "courier" ? 120 : 0;
    const grandTotal = total + shippingFee;

    const invoiceLines = cart.map(item => (
        `- ${item.quantity} x ${item.title}
  Color: ${item.color || "N/A"}
  Size: ${item.size || "N/A"}
  Price: R${(item.price * item.quantity).toFixed(2)}`
    )).join("\n");

    const invoice = `
🛍️ ORDER INVOICE
Customer: ${name}

${invoiceLines}

Shipping: ${shippingOption}
Subtotal: R${total.toFixed(2)}
Shipping Fee: R${shippingFee.toFixed(2)}
TOTAL: R${grandTotal.toFixed(2)}

Transaction ID: ${transactionId}
Address: ${address}
Payment: ${paymentMethod || "N/A"}
`;

    try {
        // 1. ALWAYS SEND ADMIN EMAIL (GUARANTEED DELIVERY)
        const adminResult = await resend.emails.send({
            from: "Horti Couture <onboarding@resend.dev>",
            to: ADMIN_EMAIL,
            subject: `New Order ${transactionId}`,
            html: `<pre>${invoice}</pre>`,
        });

        console.log("✅ ADMIN EMAIL SENT:", adminResult);

        // 2. CUSTOMER EMAIL ONLY IF VALID
        if (safeEmail) {
            const customerResult = await resend.emails.send({
                from: "Horti Couture <onboarding@resend.dev>",
                to: safeEmail,
                subject: "Your Order Invoice",
                html: `<pre>${invoice}</pre>`,
            });

            console.log("✅ CUSTOMER EMAIL SENT:", customerResult);
        } else {
            console.log("⚠️ No customer email provided - skipped");
        }

        res.json({
            success: true,
            transactionId,
        });

    } catch (err) {
        console.error("❌ CHECKOUT ERROR:", err);
        res.status(500).json({ error: "Checkout failed" });
    }
});

// ========================
// START SERVER
// ========================
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});