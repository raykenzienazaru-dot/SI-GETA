
class SigetaDashboard {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.updateTimeout = null;

    // === HiveMQ Cloud config (pakai WebSocket Secure) ===
    this.config = {
      host: "wss://5a3f69bb4b2048c198b57db5820a2fb1.s1.eu.hivemq.cloud:8884/mqtt",
      username: "esp32-kenzie",
      password: "Esp32-kenzie",
      clientId: "sigeta-web-" + Math.random().toString(16).substr(2, 8),
      reconnectPeriod: 3000,
      connectTimeout: 6000,
    };

    this.initializeMQTT();
    this.setupEventListeners();
    this.setupMobileMenu();
  }

  initializeMQTT() {
    try {
      this.updateConnectionStatus("connecting");

      this.client = mqtt.connect(this.config.host, {
        username: this.config.username,
        password: this.config.password,
        reconnectPeriod: this.config.reconnectPeriod,
        connectTimeout: this.config.connectTimeout,
        clientId: this.config.clientId,
      });

      this.setupMQTTEvents();
    } catch (error) {
      console.error("❌ Gagal inisialisasi MQTT:", error);
      this.updateConnectionStatus("disconnected");
      this.handleConnectionError();
    }
  }

  setupMQTTEvents() {
    this.client.on("connect", () => {
      console.log("✅ Terhubung ke HiveMQ Cloud");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.updateConnectionStatus("connected");

      this.subscribeToTopics();
    });

    this.client.on("message", (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on("error", (error) => {
      console.error("❌ Error MQTT:", error.message);
      this.updateConnectionStatus("disconnected");
      this.handleConnectionError();
    });

    this.client.on("close", () => {
      console.warn("🔌 Koneksi MQTT tertutup");
      this.isConnected = false;
      this.updateConnectionStatus("disconnected");
    });

    this.client.on("offline", () => {
      console.warn("⚠️ MQTT offline");
      this.isConnected = false;
      this.updateConnectionStatus("disconnected");
    });
  }

  subscribeToTopics() {
    const topics = [
      "SIGETA-SUHU",
      "SIGETA-KELEMBAPAN",
      "SIGETA-GAS",
      "SIGETA-STATUS",
      "SIGETA-STATUS-AI",
    ];

    topics.forEach((topic) => {
      this.client.subscribe(topic, (err) => {
        if (err) console.error(`❌ Gagal subscribe ${topic}:`, err);
        else console.log(`📡 Subscribed ke ${topic}`);
      });
    });
  }

  handleMessage(topic, message) {
    const msg = message.toString().trim();
    console.log("📩", topic, ":", msg);
    if (!msg) return;

    // Update UI
    this.updateUI(topic, msg);
  }

  updateUI(topic, value) {
    if (this.updateTimeout) clearTimeout(this.updateTimeout);

    this.updateTimeout = setTimeout(() => {
      const map = {
        "SIGETA-SUHU": "suhu",
        "SIGETA-KELEMBAPAN": "lembap",
        "SIGETA-GAS": "gas",
        "SIGETA-STATUS": "status",
        "SIGETA-STATUS-AI": "ai",
      };

      const elementId = map[topic];
      if (!elementId) return;

      const el = document.getElementById(elementId);
      if (el) el.textContent = value;

      if (topic === "SIGETA-GAS") this.updateGasStatus(value);
      if (topic === "SIGETA-STATUS-AI") this.updateAIStatus(value);
    }, 100);
  }

  updateGasStatus(value) {
    const v = parseFloat(value);
    const indicator = document.getElementById("status-indicator");
    const text = document.getElementById("status-text");
    if (!indicator || isNaN(v)) return;

    if (v < 100) {
      indicator.className = "indicator active";
      text.textContent = "Kondisi toilet baik";
    } else if (v < 200) {
      indicator.className = "indicator warning";
      text.textContent = "Perlu perhatian";
    } else {
      indicator.className = "indicator danger";
      text.textContent = "Kondisi buruk - semprot aktif";
    }
  }

  updateAIStatus(msg) {
    const indicator = document.getElementById("ai-indicator");
    const text = document.getElementById("ai-text");
    if (!indicator) return;

    if (/Analisis/i.test(msg)) {
      indicator.className = "indicator warning";
      text.textContent = "AI menganalisis data";
    } else if (/Aman/i.test(msg)) {
      indicator.className = "indicator active";
      text.textContent = "Kondisi aman";
    } else if (/Semprot/i.test(msg)) {
      indicator.className = "indicator danger";
      text.textContent = "AI memerintahkan semprot";
    } else {
      indicator.className = "indicator idle";
      text.textContent = msg;
    }
  }

  updateConnectionStatus(status) {
    const el = document.getElementById("connectionStatus");
    if (!el) return;
    const messages = {
      connected: "✅ Terhubung ke server HiveMQ Cloud",
      connecting: "🔄 Menghubungkan ke server...",
      disconnected: "❌ Terputus dari server",
      demo: "🔶 Mode Demo (Data simulasi)",
    };
    el.textContent = messages[status] || "Status tidak diketahui";
    el.className = `connection-status ${status}`;
  }

  handleConnectionError() {
    this.reconnectAttempts++;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn("❗ Maksimal percobaan tercapai, aktifkan demo mode.");
      this.useFallbackData();
    }
  }

  useFallbackData() {
    const data = {
      suhu: "27.2",
      lembap: "62",
      gas: "88",
      status: "Mode Demo",
      ai: "Analisis data simulasi",
    };
    for (let key in data) {
      const el = document.getElementById(key);
      if (el) el.textContent = data[key];
    }
    this.updateGasStatus("88");
    this.updateAIStatus("Analisis data simulasi");
    this.updateConnectionStatus("demo");
  }

  setupMobileMenu() {
    const btn = document.getElementById("mobileMenuBtn");
    const nav = document.getElementById("mainNav");
    if (!btn || !nav) return;

    btn.addEventListener("click", () => {
      nav.classList.toggle("active");
    });
  }

  setupEventListeners() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !this.isConnected && this.client) {
        console.log("🔁 Mencoba reconnect...");
        this.client.reconnect();
      }
    });
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      console.log("MQTT disconnected.");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    if (typeof mqtt === "undefined") throw new Error("MQTT tidak terload");
    window.sigetaDashboard = new SigetaDashboard();
  } catch (err) {
    console.error(err);
    const el = document.getElementById("connectionStatus");
    if (el) {
      el.textContent = "❌ Error memuat aplikasi";
      el.className = "connection-status disconnected";
    }
  }
});

window.addEventListener("beforeunload", () => {
  if (window.sigetaDashboard) window.sigetaDashboard.disconnect();
});

