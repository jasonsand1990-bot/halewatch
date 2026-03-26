const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_API = "https://data-api.polymarket.com";

// Health check
app.get("/", (req, res) => {
  res.json({ status: "WhaleWatch API running", time: new Date().toISOString() });
});

// Get trades for a wallet
app.get("/trades", async (req, res) => {
  const { user, limit = 25 } = req.query;
  if (!user) return res.status(400).json({ error: "user address required" });

  try {
    const url = `${DATA_API}/activity?user=${user}&type=TRADE&limit=${limit}`;
    const response = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "WhaleWatch/1.0" }
    });

    if (!response.ok) throw new Error(`Polymarket returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error fetching trades:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get trades for multiple wallets at once
app.get("/bulk-trades", async (req, res) => {
  const { users, limit = 25, minSize = 500 } = req.query;
  if (!users) return res.status(400).json({ error: "users param required (comma-separated addresses)" });

  const walletList = users.split(",").map(u => u.trim()).filter(Boolean);

  try {
    const results = await Promise.allSettled(
      walletList.map(async (address) => {
        const url = `${DATA_API}/activity?user=${address}&type=TRADE&limit=${limit}`;
        const response = await fetch(url, {
          headers: { "Accept": "application/json", "User-Agent": "WhaleWatch/1.0" }
        });
        if (!response.ok) throw new Error(`Failed for ${address}`);
        const data = await response.json();
        return { address, trades: data || [] };
      })
    );

    const allTrades = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value.trades.map(t => ({
        ...t,
        trackedWallet: r.value.address
      })))
      .filter(t => (t.usdcSize || 0) >= Number(minSize))
      .sort((a, b) => b.timestamp - a.timestamp);

    res.json({ trades: allTrades, wallets: walletList.length, timestamp: Date.now() });
  } catch (err) {
    console.error("Bulk fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get Polymarket leaderboard (top profit wallets)
app.get("/leaderboard", async (req, res) => {
  const { limit = 20 } = req.query;
  try {
    const url = `${DATA_API}/leaderboard?limit=${limit}`;
    const response = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "WhaleWatch/1.0" }
    });
    if (!response.ok) throw new Error(`Polymarket returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`WhaleWatch API running on port ${PORT}`);
});
