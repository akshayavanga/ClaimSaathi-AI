import { useState, useEffect, useMemo, useRef } from "react";
import {
  ShieldCheck, LayoutDashboard, Package, FileText,
  MessageCircle, Settings, Bell, Plus, Search,
  Clock, AlertCircle, ArrowUpRight, Upload,
  CheckCircle, Smartphone, Trash2, X, RefreshCw,
  Sparkles, ExternalLink, Copy, Check, FileCheck,
  Edit, Printer, RotateCcw
} from "lucide-react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function getWarrantyDetails(date) {
  if (!date) return { status: "Unknown", label: "Date unknown", badgeClass: "unknown", days: null };

  const expiry = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const days = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return {
      status: "Expired",
      label: `${Math.abs(days)}d ago`,
      badgeClass: "expired",
      days
    };
  }
  if (days === 0) {
    return {
      status: "Expiring Soon",
      label: "Expires Today!",
      badgeClass: "expiring-soon",
      days
    };
  }
  if (days <= 30) {
    return {
      status: "Expiring Soon",
      label: `${days}d left`,
      badgeClass: "expiring-soon",
      days
    };
  }
  return {
    status: "Active",
    label: `${days}d left`,
    badgeClass: "active",
    days
  };
}

function formatDate(date) {
  if (!date) return "Not available";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function normalizeProduct(p) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand || "",
    purchaseDate: p.purchase_date,
    warrantyMonths: p.warranty_months,
    price: p.purchase_price,
    warrantyEnd: p.warranty_end,
    retailer: p.retailer || "",
    invoiceNo: p.invoice_no || ""
  };
}

function formatPrice(price) {
  return `₹${Number(price || 0).toLocaleString("en-IN")}`;
}

export default function App() {
  const [active, setActive] = useState("Dashboard");
  const [products, setProducts] = useState([]);
  const [claims, setClaims] = useState([]);
  const [documents, setDocuments] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalData, setLegalData] = useState(null);
  const [generatingLegal, setGeneratingLegal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Invoice scan & document link
  const [scanning, setScanning] = useState(false);
  const [scannedDocId, setScannedDocId] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docProductId, setDocProductId] = useState("");
  const [extractingDocId, setExtractingDocId] = useState(null);
  const [showExtractedModal, setShowExtractedModal] = useState(false);
  const [extractedData, setExtractedData] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const scanFileRef = useRef(null);

  // User Profile
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const saved = localStorage.getItem("claimsaathi_user");
      return saved ? JSON.parse(saved) : {
        name: "Akshaya",
        state: "Telangana",
        email: "akshaya@example.com"
      };
    } catch {
      return { name: "Akshaya", state: "Telangana", email: "akshaya@example.com" };
    }
  });

  // Persistent Chat Messages
  const [chatMessages, setChatMessages] = useState(() => {
    try {
      const saved = localStorage.getItem("claimsaathi_chat_history");
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [
      {
        role: "assistant",
        text: `Namaste ${userProfile.name}! I am **ClaimSaathi AI**, your consumer protection advocate and warranty advisor.

I have direct access to your registered products and active claims.

How can I help you today?
* Check warranty coverage & days remaining
* Understand your rights under Consumer Protection Act, 2019
* Draft formal complaints or National Consumer Helpline (NCH 1915) grievances`
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem("claimsaathi_chat_history", JSON.stringify(chatMessages));
    } catch {
      // ignore
    }
  }, [chatMessages]);

  // Product Form State (Add)
  const [productForm, setProductForm] = useState({
    name: "",
    brand: "",
    purchaseDate: "",
    warrantyMonths: "12",
    price: "",
    retailer: "",
    invoiceNo: ""
  });

  // Product Form State (Edit)
  const [editForm, setEditForm] = useState({
    name: "",
    brand: "",
    purchaseDate: "",
    warrantyMonths: "12",
    price: "",
    retailer: "",
    invoiceNo: ""
  });

  // Claim Form State
  const [claimForm, setClaimForm] = useState({
    productId: "",
    issue: "",
    description: "",
    desiredResolution: "Free Repair / Replacement under Warranty"
  });

  const menu = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "My Products", icon: Package },
    { name: "Claims", icon: ShieldCheck },
    { name: "Documents", icon: FileText },
    { name: "AI Assistant", icon: MessageCircle },
    { name: "Settings", icon: Settings }
  ];

  // Fetch Products
  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API}/products`);
      if (!response.ok) throw new Error("Unable to fetch products.");
      const data = await response.json();
      if (Array.isArray(data)) {
        setProducts(data.map(normalizeProduct));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Fetch Claims
  const fetchClaims = async () => {
    try {
      const response = await fetch(`${API}/claims`);
      if (!response.ok) throw new Error("Unable to fetch claims.");
      const data = await response.json();
      if (Array.isArray(data)) {
        setClaims(data);
      }
    } catch (err) {
      console.error("Error fetching claims:", err);
    }
  };

  // Fetch Documents
  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API}/documents`);
      if (!response.ok) throw new Error("Unable to fetch documents.");
      const data = await response.json();
      if (Array.isArray(data)) {
        setDocuments(data);
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    setError("");
    await Promise.all([fetchProducts(), fetchClaims(), fetchDocuments()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brand.toLowerCase().includes(searchQuery.toLowerCase());

      const details = getWarrantyDetails(p.warrantyEnd);
      const matchStatus = statusFilter === "All" || details.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [products, searchQuery, statusFilter]);

  // Product Counts
  const activeProducts = products.filter(
    p => getWarrantyDetails(p.warrantyEnd).status === "Active"
  ).length;

  const expiringProducts = products.filter(
    p => getWarrantyDetails(p.warrantyEnd).status === "Expiring Soon"
  ).length;

  const expiredProducts = products.filter(
    p => getWarrantyDetails(p.warrantyEnd).status === "Expired"
  ).length;

  // Add Product & Auto-link scanned document
  const addProduct = async (e) => {
    e.preventDefault();
    if (!productForm.name.trim() || !productForm.purchaseDate) {
      setError("Enter the product name and purchase date.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      name: productForm.name.trim(),
      brand: productForm.brand.trim(),
      purchase_date: productForm.purchaseDate,
      warranty_months: Number(productForm.warrantyMonths),
      purchase_price: Number(productForm.price) || 0,
      retailer: productForm.retailer.trim(),
      invoice_no: productForm.invoiceNo.trim()
    };

    try {
      const response = await fetch(`${API}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Product registration failed.");

      // If an invoice was scanned with Gemini, link that document to this created product!
      if (scannedDocId) {
        try {
          await fetch(`${API}/documents/${scannedDocId}/link`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: result.product_id })
          });
        } catch (linkErr) {
          console.error("Error auto-linking scanned invoice:", linkErr);
        }
        setScannedDocId(null);
      }

      await refreshAll();
      setProductForm({
        name: "",
        brand: "",
        purchaseDate: "",
        warrantyMonths: "12",
        price: "",
        retailer: "",
        invoiceNo: ""
      });
      setShowProductModal(false);
      setSuccess("Product registered & invoice linked successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Open Edit Product Modal
  const openEditModal = (product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      brand: product.brand,
      purchaseDate: product.purchaseDate,
      warrantyMonths: String(product.warrantyMonths),
      price: String(product.price || ""),
      retailer: product.retailer,
      invoiceNo: product.invoiceNo
    });
    setShowEditModal(true);
  };

  // Submit Edit Product
  const updateProduct = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      name: editForm.name.trim(),
      brand: editForm.brand.trim(),
      purchase_date: editForm.purchaseDate,
      warranty_months: Number(editForm.warrantyMonths),
      purchase_price: Number(editForm.price) || 0,
      retailer: editForm.retailer.trim(),
      invoice_no: editForm.invoiceNo.trim()
    };

    try {
      const response = await fetch(`${API}/products/${editingProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Product update failed.");

      await fetchProducts();
      setShowEditModal(false);
      setEditingProduct(null);
      setSuccess("Product updated successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete Product
  const deleteProduct = async (id) => {
    if (!window.confirm("Are you sure you want to remove this product?")) return;
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API}/products/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const res = await response.json();
        throw new Error(res.detail || "Unable to delete product.");
      }
      await refreshAll();
      setSuccess("Product removed successfully!");
    } catch (err) {
      setError(err.message);
    }
  };

  // Gemini Multimodal Invoice OCR
  const handleScanInvoice = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API}/extract-invoice`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Gemini invoice extraction failed.");
      }

      setProductForm(prev => ({
        ...prev,
        name: data.name || prev.name,
        brand: data.brand || prev.brand,
        purchaseDate: data.purchase_date || prev.purchaseDate,
        warrantyMonths: String(data.warranty_months || 12),
        price: data.purchase_price ? String(data.purchase_price) : prev.price,
        retailer: data.retailer || prev.retailer,
        invoiceNo: data.invoice_no || prev.invoiceNo
      }));

      if (data.document_id) {
        setScannedDocId(data.document_id);
      }

      await fetchDocuments();
      setSuccess("Invoice scanned with Gemini AI! Details pre-filled. Click 'Save Product' to register.");
    } catch (err) {
      setError("AI Scan Error: " + err.message);
    } finally {
      setScanning(false);
      e.target.value = "";
    }
  };

  // Extract Invoice from existing uploaded document (Gemini Multimodal)
  const handleExtractInvoiceFromDoc = async (doc) => {
    setExtractingDocId(doc.id);
    setError("");
    setSuccess("");

    try {
      const fileRes = await fetch(`${API}${doc.file_url}`);
      if (!fileRes.ok) {
        throw new Error("Unable to retrieve invoice file from server.");
      }
      const blob = await fileRes.blob();
      const ext = (doc.filename || "").toLowerCase();
      const mime = ext.endsWith(".pdf")
        ? "application/pdf"
        : ext.endsWith(".png")
        ? "image/png"
        : "image/jpeg";
      const file = new File([blob], doc.filename, { type: mime });

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API}/extract-invoice`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Gemini invoice extraction failed.");
      }

      setExtractedData({
        ...data,
        sourceDocId: doc.id,
        sourceFilename: doc.filename,
        sourceProductId: doc.product_id,
        sourceProductName: doc.product_name
      });
      setShowExtractedModal(true);
      setSuccess(`Invoice extracted successfully for "${doc.filename}"!`);
    } catch (err) {
      setError(`Extraction error for ${doc.filename}: ${err.message}`);
    } finally {
      setExtractingDocId(null);
    }
  };

  // Create Claim
  const submitClaim = async (e) => {
    e.preventDefault();
    if (!claimForm.productId || !claimForm.issue.trim()) {
      setError("Please select a product and describe the issue.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API}/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: Number(claimForm.productId),
          issue: claimForm.issue.trim(),
          description: claimForm.description.trim()
        })
      });

      const res = await response.json();
      if (!response.ok) throw new Error(res.detail || "Failed to submit claim.");

      await fetchClaims();
      setShowClaimModal(false);
      setClaimForm({
        productId: "",
        issue: "",
        description: "",
        desiredResolution: "Free Repair / Replacement under Warranty"
      });
      setSuccess("Warranty claim submitted successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Update Claim Status
  const updateClaimStatus = async (claimId, newStatus) => {
    try {
      const response = await fetch(`${API}/claims/${claimId}?status=${encodeURIComponent(newStatus)}`, {
        method: "PATCH"
      });
      if (!response.ok) throw new Error("Could not update claim status.");
      await fetchClaims();
      setSuccess(`Claim status updated to "${newStatus}"`);
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete Claim
  const deleteClaim = async (claimId) => {
    if (!window.confirm("Are you sure you want to delete this claim?")) return;
    try {
      const response = await fetch(`${API}/claims/${claimId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete claim.");
      await fetchClaims();
      setSuccess("Claim removed.");
    } catch (err) {
      setError(err.message);
    }
  };

  // Generate AI Legal Notice / Claim Letter
  const generateLegalNotice = async (claimOrProduct) => {
    setGeneratingLegal(true);
    setShowLegalModal(true);
    setLegalData(null);
    setCopied(false);

    const productId = claimOrProduct.product_id || claimOrProduct.id;
    const issue = claimOrProduct.issue || "Defect / Warranty Coverage Denial";
    const description = claimOrProduct.description || "The product malfunctioned within the warranty period and requires prompt repair or replacement under the Consumer Protection Act, 2019.";

    try {
      const response = await fetch(`${API}/generate-claim-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          issue: issue,
          description: description,
          desired_resolution: "Immediate repair, replacement, or full refund",
          consumer_name: userProfile.name
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to generate legal notice.");
      setLegalData(data);
    } catch (err) {
      setError("AI Notice Generation Error: " + err.message);
      setShowLegalModal(false);
    } finally {
      setGeneratingLegal(false);
    }
  };

  // Print / Save Legal Notice as PDF
  const printLegalNotice = () => {
    if (!legalData?.legal_package) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to print/save PDF.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ClaimSaathi AI - Legal Notice - ${legalData.product_name || "Consumer Claim"}</title>
        <style>
          body { font-family: 'Times New Roman', Times, serif; padding: 40px; color: #111; line-height: 1.6; font-size: 13pt; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 24px; }
          .header h1 { margin: 0; font-size: 20pt; text-transform: uppercase; letter-spacing: 1px; color: #1e3a8a; }
          .header p { margin: 4px 0 0; font-size: 11pt; color: #555; }
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 11pt; }
          .meta-table td { padding: 6px 10px; border: 1px solid #ccc; }
          .meta-table strong { color: #222; }
          .content { white-space: pre-wrap; font-family: inherit; font-size: 12pt; line-height: 1.7; }
          .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 10pt; color: #777; text-align: center; }
          @media print {
            body { padding: 20px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>ClaimSaathi AI — Consumer Legal Grievance</h1>
          <p>Issued in accordance with the Consumer Protection Act, 2019 (Govt. of India)</p>
        </div>

        <table class="meta-table">
          <tr>
            <td><strong>Claimant:</strong> ${userProfile.name} (${userProfile.state}, India)</td>
            <td><strong>Date of Notice:</strong> ${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</td>
          </tr>
          <tr>
            <td><strong>Product:</strong> ${legalData.product_name} (${legalData.product_brand || "Manufacturer"})</td>
            <td><strong>Warranty Expiry:</strong> ${legalData.warranty_end || "Active"}</td>
          </tr>
        </table>

        <div class="content">${legalData.legal_package.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>

        <div class="footer">
          Generated via ClaimSaathi AI • National Consumer Helpline: 1915 • e-Daakhil Portal
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Upload Document
  const uploadDocument = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDoc(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("file", file);
    if (docProductId) {
      formData.append("product_id", docProductId);
    }

    try {
      const response = await fetch(`${API}/upload-invoice`, {
        method: "POST",
        body: formData
      });

      const res = await response.json();
      if (!response.ok) throw new Error(res.detail || "Document upload failed.");

      await fetchDocuments();
      setSuccess("Invoice uploaded and organized successfully!");
      setDocProductId("");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingDoc(false);
      e.target.value = "";
    }
  };

  // Link existing document to product
  const linkExistingDoc = async (docId, newProductId) => {
    try {
      const response = await fetch(`${API}/documents/${docId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: newProductId ? Number(newProductId) : null })
      });
      if (!response.ok) throw new Error("Could not link document.");
      await fetchDocuments();
      setSuccess("Document product linkage updated!");
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete Document
  const deleteDocument = async (docId) => {
    if (!window.confirm("Remove this document?")) return;
    try {
      const response = await fetch(`${API}/documents/${docId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete document.");
      await fetchDocuments();
      setSuccess("Document deleted.");
    } catch (err) {
      setError(err.message);
    }
  };

  // Copy Legal Text
  const copyLegalText = () => {
    if (legalData?.legal_package) {
      navigator.clipboard.writeText(legalData.legal_package);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Clear Chat History
  const clearChatHistory = () => {
    if (window.confirm("Clear all AI Assistant conversation history?")) {
      const resetMsg = [
        {
          role: "assistant",
          text: `Namaste ${userProfile.name}! Conversation cleared. How can I help you today with your warranties, invoices, or consumer claims?`
        }
      ];
      setChatMessages(resetMsg);
      localStorage.removeItem("claimsaathi_chat_history");
    }
  };

  // Save Settings
  const saveUserProfile = (e) => {
    e.preventDefault();
    localStorage.setItem("claimsaathi_user", JSON.stringify(userProfile));
    setSuccess("Profile settings saved successfully!");
  };

  const userInitials = (userProfile.name || "AK")
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="app">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={29} />
          <span>ClaimSaathi <b>AI</b></span>
        </div>

        <p className="menu-title">WORKSPACE</p>

        {menu.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.name}
              className={`nav-item ${active === item.name ? "active" : ""}`}
              onClick={() => {
                setActive(item.name);
                setError("");
                setSuccess("");
              }}
            >
              <Icon size={19} />
              {item.name}
            </button>
          );
        })}

        <div className="sidebar-bottom">
          <div className="avatar">{userInitials}</div>
          <div>
            <strong>{userProfile.name}</strong>
            <small>{userProfile.state}, India</small>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main">

        {/* TOPBAR */}
        <header className="topbar">
          <div>
            <h2>{active}</h2>
            <p>Your AI-powered Consumer Rights & Warranty Companion</p>
          </div>

          <div className="top-actions">
            <button
              className="icon-btn"
              title="Refresh All Data"
              onClick={refreshAll}
            >
              <RefreshCw size={19} className={loading ? "animate-spin" : ""} />
            </button>

            <div style={{ position: "relative" }}>
              <button
                className="icon-btn"
                title="Notifications"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <Bell size={19} />
                {(expiringProducts > 0 || expiredProducts > 0) && (
                  <span style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 8,
                    height: 8,
                    background: "#ef4444",
                    borderRadius: "50%"
                  }} />
                )}
              </button>

              {notificationsOpen && (
                <div style={{
                  position: "absolute",
                  right: 0,
                  top: 48,
                  width: 280,
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                  padding: 16,
                  zIndex: 20,
                  textAlign: "left"
                }}>
                  <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
                    Warranty Alerts
                  </strong>
                  {expiringProducts > 0 ? (
                    <p style={{ fontSize: 12, color: "#b45309", marginBottom: 6 }}>
                      ⚠️ {expiringProducts} product(s) expiring within 30 days!
                    </p>
                  ) : null}
                  {expiredProducts > 0 ? (
                    <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 6 }}>
                      ℹ️ {expiredProducts} product warranty has expired.
                    </p>
                  ) : null}
                  {expiringProducts === 0 && expiredProducts === 0 && (
                    <p style={{ fontSize: 12, color: "#64748b" }}>
                      ✅ All registered warranties are in good standing.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="avatar" title={userProfile.name}>
              {userInitials}
            </div>
          </div>
        </header>

        {/* NOTIFICATIONS & ALERTS */}
        {error && (
          <div className="activity-empty" role="alert" style={{ background: "#fef2f2", color: "#b91c1c", padding: "12px 18px", borderRadius: 10, marginBottom: 18 }}>
            <AlertCircle size={19} />
            <span style={{ flex: 1, textAlign: "left" }}>{error}</span>
            <button onClick={() => setError("")} style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>
        )}

        {success && (
          <div className="activity-empty" role="status" style={{ background: "#f0fdf4", color: "#15803d", padding: "12px 18px", borderRadius: 10, marginBottom: 18 }}>
            <CheckCircle size={19} />
            <span style={{ flex: 1, textAlign: "left" }}>{success}</span>
            <button onClick={() => setSuccess("")} style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* 1. DASHBOARD */}
        {active === "Dashboard" && (
          <>
            <section className="welcome">
              <div>
                <span className="eyebrow">GOOGLE STARTUP BUILDATHON SHOWCASE</span>
                <h1>Welcome back, {userProfile.name}!</h1>
                <p>Track warranties, auto-scan invoices with Gemini AI, and draft legal consumer claims.</p>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="primary-btn"
                  onClick={() => setShowProductModal(true)}
                >
                  <Plus size={18} /> Add Product
                </button>
                <button
                  className="outline-btn primary"
                  style={{ background: "white", padding: "12px 16px", borderRadius: 9 }}
                  onClick={() => setShowClaimModal(true)}
                >
                  <ShieldCheck size={18} /> File Claim
                </button>
              </div>
            </section>

            <section className="stats">
              <Stat icon={Package} title="Total Products" value={products.length} />
              <Stat icon={ShieldCheck} title="Active Warranties" value={activeProducts} />
              <Stat icon={Clock} title="Expiring Soon" value={expiringProducts} />
              <Stat icon={AlertCircle} title="Claims Filed" value={claims.length} />
            </section>

            <section className="content-grid">
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Registered Purchases</h3>
                    <p>Recent products under tracking</p>
                  </div>
                  <button className="text-btn" onClick={() => setActive("My Products")}>
                    View all <ArrowUpRight size={16} />
                  </button>
                </div>

                {products.length === 0 ? (
                  <EmptyProducts onAdd={() => setShowProductModal(true)} />
                ) : (
                  <div className="product-list">
                    {products.slice(0, 4).map(p => (
                      <ProductItem key={p.id} product={p} onEdit={openEditModal} />
                    ))}
                  </div>
                )}
              </div>

              <div className="panel assistant-panel">
                <div className="ai-icon">✦</div>
                <h3>Gemini Consumer Copilot</h3>
                <p>
                  Got an issue or warranty rejection? ClaimSaathi AI cites the <b>Consumer Protection Act, 2019</b> and drafts legal claim letters.
                </p>
                <button
                  className="primary-btn"
                  onClick={() => setActive("AI Assistant")}
                >
                  Ask ClaimSaathi <ArrowUpRight size={17} />
                </button>
              </div>
            </section>

            <section className="panel activity">
              <div className="panel-heading">
                <div>
                  <h3>Recent Claims & Invoices</h3>
                  <p>Status of ongoing grievances</p>
                </div>
                <button className="text-btn" onClick={() => setActive("Claims")}>
                  Manage Claims <ArrowUpRight size={16} />
                </button>
              </div>

              {claims.length === 0 ? (
                <div className="activity-empty">
                  <CheckCircle size={20} />
                  <span>No claims submitted yet. Everything is in good order!</span>
                </div>
              ) : (
                <div className="product-list">
                  {claims.slice(0, 3).map(c => (
                    <div key={c.id} className="product-item">
                      <div className="product-icon">
                        <ShieldCheck />
                      </div>
                      <div className="product-info">
                        <strong>{c.issue}</strong>
                        <small>Product: {c.product_name} • Filed: {formatDate(c.created_at)}</small>
                      </div>
                      <span className={`status ${c.status.toLowerCase().replace(" ", "-")}`}>
                        {c.status}
                      </span>
                      <button
                        className="outline-btn primary"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => generateLegalNotice(c)}
                      >
                        <Sparkles size={13} /> Notice
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* 2. MY PRODUCTS */}
        {active === "My Products" && (
          <section className="panel page-content">
            <div className="panel-heading">
              <div>
                <h3>My Registered Products ({filteredProducts.length})</h3>
                <p>Manage warranties, retailer details, and legal proof of purchase.</p>
              </div>
              <button className="primary-btn" onClick={() => setShowProductModal(true)}>
                <Plus size={17} /> Add Product
              </button>
            </div>

            <div className="toolbar">
              <div className="search-box">
                <Search size={16} />
                <input
                  placeholder="Search by product name or brand..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="filter-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Expiring Soon">Expiring Soon</option>
                <option value="Expired">Expired</option>
              </select>
            </div>

            {filteredProducts.length === 0 ? (
              <EmptyProducts onAdd={() => setShowProductModal(true)} />
            ) : (
              <div className="product-list">
                {filteredProducts.map(p => {
                  const details = getWarrantyDetails(p.warrantyEnd);
                  return (
                    <div className="product-item" key={p.id}>
                      <div className="product-icon">
                        <Smartphone />
                      </div>

                      <div className="product-info">
                        <strong>{p.name}</strong>
                        <small>
                          {p.brand || "Brand unspecified"} • Purchased: {formatDate(p.purchaseDate)}
                          {p.retailer ? ` via ${p.retailer}` : ""}
                        </small>
                        <small>
                          Warranty: {p.warrantyMonths} Months (Ends {formatDate(p.warrantyEnd)}) • Price: {formatPrice(p.price)}
                        </small>
                      </div>

                      <span className={`status ${details.badgeClass}`}>
                        {details.status}
                        <span className="badge-days">• {details.label}</span>
                      </span>

                      <button
                        className="edit-btn"
                        title="Edit Product"
                        onClick={() => openEditModal(p)}
                      >
                        <Edit size={16} />
                      </button>

                      <button
                        className="outline-btn primary"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        title="Generate Legal Notice / Claim Draft"
                        onClick={() => generateLegalNotice(p)}
                      >
                        <Sparkles size={14} /> AI Notice
                      </button>

                      <button
                        className="delete-btn"
                        title="Remove product"
                        onClick={() => deleteProduct(p.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 3. CLAIMS MANAGEMENT */}
        {active === "Claims" && (
          <section className="panel page-content">
            <div className="panel-heading">
              <div>
                <h3>Consumer Claims & Grievances ({claims.length})</h3>
                <p>Track formal disputes, warranty complaints, and legal notices.</p>
              </div>

              <button
                className="primary-btn"
                onClick={() => {
                  if (products.length === 0) {
                    setError("Please register a product before filing a claim.");
                    return;
                  }
                  setShowClaimModal(true);
                }}
              >
                <Plus size={17} /> File New Claim
              </button>
            </div>

            {claims.length === 0 ? (
              <div className="empty-state">
                <ShieldCheck size={44} style={{ color: "#3b82f6", marginBottom: 12 }} />
                <h3>No claims filed yet</h3>
                <p>
                  Having issues with a phone, appliance, or laptop? File a claim and ClaimSaathi AI will draft a legally grounded notice citing the Consumer Protection Act, 2019.
                </p>
                <button
                  className="primary-btn"
                  onClick={() => setShowClaimModal(true)}
                >
                  <Plus size={16} /> File your first claim
                </button>
              </div>
            ) : (
              <div className="claims-grid">
                {claims.map(claim => (
                  <div className="claim-card" key={claim.id}>
                    <div className="claim-header">
                      <div>
                        <span className="claim-product-tag">
                          <Package size={12} /> {claim.product_name}
                        </span>
                        <h4 style={{ margin: "8px 0 4px", fontSize: 15, color: "#0f172a" }}>
                          {claim.issue}
                        </h4>
                      </div>

                      <span className={`status ${claim.status.toLowerCase().replace(" ", "-")}`}>
                        {claim.status}
                      </span>
                    </div>

                    <p className="claim-desc">
                      {claim.description || "No additional description provided."}
                    </p>

                    <div style={{ fontSize: 11, color: "#8994a6" }}>
                      Filed on {formatDate(claim.created_at)}
                    </div>

                    <div className="claim-footer">
                      <select
                        className="filter-select"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        value={claim.status}
                        onChange={(e) => updateClaimStatus(claim.id, e.target.value)}
                      >
                        <option value="Submitted">Submitted</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Approved">Approved</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Rejected">Rejected</option>
                      </select>

                      <div className="claim-actions">
                        <button
                          className="outline-btn primary"
                          onClick={() => generateLegalNotice(claim)}
                          title="Generate Formal Claim Package"
                        >
                          <Sparkles size={14} /> AI Legal Notice
                        </button>

                        <button
                          className="delete-btn"
                          title="Delete claim"
                          onClick={() => deleteClaim(claim.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 4. DOCUMENTS GALLERY */}
        {active === "Documents" && (
          <section className="panel page-content">
            <div className="panel-heading">
              <div>
                <h3>My Invoices & Warranty Documents ({documents.length})</h3>
                <p>Digital repository for bills, purchase receipts, and service job sheets.</p>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  className="filter-select"
                  value={docProductId}
                  onChange={(e) => setDocProductId(e.target.value)}
                >
                  <option value="">Link to product (optional)</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                <label className="primary-btn" style={{ cursor: "pointer", margin: 0 }}>
                  <Upload size={16} />
                  {uploadingDoc ? "Uploading..." : "Upload Invoice"}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    hidden
                    disabled={uploadingDoc}
                    onChange={uploadDocument}
                  />
                </label>
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="empty-state">
                <FileText size={44} style={{ color: "#3b82f6", marginBottom: 12 }} />
                <h3>No documents uploaded yet</h3>
                <p>Keep your tax invoices and warranty cards safe for seamless warranty claims.</p>
              </div>
            ) : (
              <div className="documents-grid">
                {documents.map(doc => {
                  const isImage = /\.(png|jpe?g)$/i.test(doc.filename);
                  return (
                    <div className="doc-card" key={doc.id}>
                      <div
                        className="doc-thumbnail"
                        title="Click to view file"
                        onClick={() => window.open(`${API}${doc.file_url}`, "_blank")}
                      >
                        {isImage ? (
                          <img
                            src={`${API}${doc.file_url}`}
                            alt={doc.filename}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <FileCheck size={22} color="#2563eb" />
                        )}
                      </div>

                      <div className="doc-details">
                        <h4 className="doc-title" title={doc.filename}>
                          {doc.filename}
                        </h4>
                        <div className="doc-meta" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <span>Linked:</span>
                          <select
                            className="doc-link-select"
                            value={doc.product_id || ""}
                            onChange={(e) => linkExistingDoc(doc.id, e.target.value)}
                          >
                            <option value="">Unlinked</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="doc-meta">
                          Uploaded: {formatDate(doc.uploaded_at)}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          className="outline-btn primary"
                          style={{ padding: "5px 8px", fontSize: 11 }}
                          title="Extract invoice details with Gemini AI"
                          disabled={extractingDocId === doc.id}
                          onClick={() => handleExtractInvoiceFromDoc(doc)}
                        >
                          {extractingDocId === doc.id ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" /> Extracting...
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} /> Extract Invoice
                            </>
                          )}
                        </button>

                        <a
                          href={`${API}${doc.file_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="outline-btn"
                          style={{ padding: "5px 8px", fontSize: 11 }}
                          title="View / Download File"
                        >
                          <ExternalLink size={13} /> View
                        </a>

                        <button
                          className="delete-btn"
                          style={{ padding: 4 }}
                          title="Delete Document"
                          onClick={() => deleteDocument(doc.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 5. AI ASSISTANT (WITH PERSISTENT HISTORY & CLEAR) */}
        {active === "AI Assistant" && (
          <Assistant
            userProfile={userProfile}
            messages={chatMessages}
            setMessages={setChatMessages}
            onClearChat={clearChatHistory}
          />
        )}

        {/* 6. SETTINGS & CONSUMER RESOURCES */}
        {active === "Settings" && (
          <section className="panel page-content">
            <div className="panel-heading">
              <div>
                <h3>Settings & Consumer Protection Hub</h3>
                <p>Configure personal preferences and access Indian consumer grievance resources.</p>
              </div>
            </div>

            <div className="settings-grid">
              <div className="settings-card">
                <h4>Personal Profile</h4>
                <p>Details used when drafting legal notices and service letters.</p>

                <form onSubmit={saveUserProfile} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Full Name</label>
                  <input
                    value={userProfile.name}
                    onChange={e => setUserProfile({ ...userProfile, name: e.target.value })}
                    style={{ padding: 10, border: "1px solid #dfe5ee", borderRadius: 8 }}
                  />

                  <label style={{ fontSize: 12, fontWeight: 600 }}>State / Jurisdiction</label>
                  <input
                    value={userProfile.state}
                    onChange={e => setUserProfile({ ...userProfile, state: e.target.value })}
                    style={{ padding: 10, border: "1px solid #dfe5ee", borderRadius: 8 }}
                  />

                  <label style={{ fontSize: 12, fontWeight: 600 }}>Email Address</label>
                  <input
                    type="email"
                    value={userProfile.email}
                    onChange={e => setUserProfile({ ...userProfile, email: e.target.value })}
                    style={{ padding: 10, border: "1px solid #dfe5ee", borderRadius: 8 }}
                  />

                  <button type="submit" className="primary-btn" style={{ marginTop: 8 }}>
                    Save Profile
                  </button>
                </form>
              </div>

              <div className="settings-card">
                <h4>Official Consumer Grievance Portals</h4>
                <p>Key government portals for escalating consumer complaints in India.</p>

                <a
                  href="https://consumerhelpline.gov.in"
                  target="_blank"
                  rel="noreferrer"
                  className="resource-link"
                >
                  <div>
                    <strong>National Consumer Helpline (NCH)</strong>
                    <small style={{ display: "block", color: "#64748b" }}>Dial 1915 (Toll-Free) or Web Portal</small>
                  </div>
                  <ExternalLink size={16} />
                </a>

                <a
                  href="https://edaakhil.nic.in"
                  target="_blank"
                  rel="noreferrer"
                  className="resource-link"
                >
                  <div>
                    <strong>e-Daakhil Portal</strong>
                    <small style={{ display: "block", color: "#64748b" }}>File Consumer Cases Online (District / State)</small>
                  </div>
                  <ExternalLink size={16} />
                </a>

                <a
                  href="https://consumeraffairs.nic.in"
                  target="_blank"
                  rel="noreferrer"
                  className="resource-link"
                >
                  <div>
                    <strong>Ministry of Consumer Affairs</strong>
                    <small style={{ display: "block", color: "#64748b" }}>Consumer Protection Act 2019 Rules & Rights</small>
                  </div>
                  <ExternalLink size={16} />
                </a>

                <div style={{ marginTop: 20, padding: 12, background: "#f1f5f9", borderRadius: 8, fontSize: 12, color: "#475569" }}>
                  <strong>Tech Stack Info:</strong> ClaimSaathi AI v3.2 • React 19 + Vite • FastAPI 0.162 • SQLite 3 • Powered by Google Gemini 3.5 Flash-Lite.
                </div>
              </div>
            </div>
          </section>
        )}

      </main>

      {/* ADD PRODUCT MODAL (WITH GEMINI SMART SCAN) */}
      {showProductModal && (
        <div
          className="modal-overlay"
          onClick={() => !saving && !scanning && setShowProductModal(false)}
        >
          <form
            className="modal"
            onSubmit={addProduct}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>Add New Product</h2>
              <button
                type="button"
                className="close-btn"
                disabled={saving || scanning}
                onClick={() => setShowProductModal(false)}
              >
                <X />
              </button>
            </div>

            {/* GEMINI SMART SCAN BANNER */}
            <div className="ai-scan-banner">
              <div>
                <p>✨ Gemini AI Smart Invoice Scanner</p>
                <small>Upload your bill/invoice and Gemini will auto-fill product details!</small>
              </div>

              <label className="ai-scan-btn">
                <Sparkles size={14} />
                {scanning ? "Scanning..." : "Scan Bill"}
                <input
                  ref={scanFileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  hidden
                  disabled={scanning}
                  onChange={handleScanInvoice}
                />
              </label>
            </div>

            <label>Product Name *</label>
            <input
              required
              placeholder="e.g. Samsung Galaxy S24"
              value={productForm.name}
              onChange={e => setProductForm({ ...productForm, name: e.target.value })}
            />

            <label>Brand / Manufacturer</label>
            <input
              placeholder="e.g. Samsung"
              value={productForm.brand}
              onChange={e => setProductForm({ ...productForm, brand: e.target.value })}
            />

            <label>Purchase Date *</label>
            <input
              required
              type="date"
              value={productForm.purchaseDate}
              onChange={e => setProductForm({ ...productForm, purchaseDate: e.target.value })}
            />

            <label>Warranty Duration</label>
            <select
              value={productForm.warrantyMonths}
              onChange={e => setProductForm({ ...productForm, warrantyMonths: e.target.value })}
            >
              <option value="6">6 months</option>
              <option value="12">12 months (Standard 1 Year)</option>
              <option value="24">24 months (2 Years)</option>
              <option value="36">36 months (3 Years)</option>
              <option value="60">60 months (5 Years)</option>
            </select>

            <label>Purchase Price (₹)</label>
            <input
              type="number"
              min="0"
              placeholder="75000"
              value={productForm.price}
              onChange={e => setProductForm({ ...productForm, price: e.target.value })}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label>Retailer / Platform</label>
                <input
                  placeholder="e.g. Amazon India"
                  value={productForm.retailer}
                  onChange={e => setProductForm({ ...productForm, retailer: e.target.value })}
                />
              </div>

              <div>
                <label>Invoice Number</label>
                <input
                  placeholder="e.g. INV-98234"
                  value={productForm.invoiceNo}
                  onChange={e => setProductForm({ ...productForm, invoiceNo: e.target.value })}
                />
              </div>
            </div>

            <button
              type="submit"
              className="primary-btn submit-btn"
              disabled={saving || scanning}
            >
              {saving ? "Saving..." : "Save Product"}
            </button>
          </form>
        </div>
      )}

      {/* EDIT PRODUCT MODAL */}
      {showEditModal && editingProduct && (
        <div
          className="modal-overlay"
          onClick={() => !saving && setShowEditModal(false)}
        >
          <form
            className="modal"
            onSubmit={updateProduct}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>Edit Product Details</h2>
              <button
                type="button"
                className="close-btn"
                disabled={saving}
                onClick={() => setShowEditModal(false)}
              >
                <X />
              </button>
            </div>

            <label>Product Name *</label>
            <input
              required
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
            />

            <label>Brand / Manufacturer</label>
            <input
              value={editForm.brand}
              onChange={e => setEditForm({ ...editForm, brand: e.target.value })}
            />

            <label>Purchase Date *</label>
            <input
              required
              type="date"
              value={editForm.purchaseDate}
              onChange={e => setEditForm({ ...editForm, purchaseDate: e.target.value })}
            />

            <label>Warranty Duration</label>
            <select
              value={editForm.warrantyMonths}
              onChange={e => setEditForm({ ...editForm, warrantyMonths: e.target.value })}
            >
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">24 months</option>
              <option value="36">36 months</option>
              <option value="60">60 months</option>
            </select>

            <label>Purchase Price (₹)</label>
            <input
              type="number"
              min="0"
              value={editForm.price}
              onChange={e => setEditForm({ ...editForm, price: e.target.value })}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label>Retailer</label>
                <input
                  value={editForm.retailer}
                  onChange={e => setEditForm({ ...editForm, retailer: e.target.value })}
                />
              </div>

              <div>
                <label>Invoice Number</label>
                <input
                  value={editForm.invoiceNo}
                  onChange={e => setEditForm({ ...editForm, invoiceNo: e.target.value })}
                />
              </div>
            </div>

            <button
              type="submit"
              className="primary-btn submit-btn"
              disabled={saving}
            >
              {saving ? "Updating..." : "Update Product"}
            </button>
          </form>
        </div>
      )}

      {/* FILE NEW CLAIM MODAL */}
      {showClaimModal && (
        <div
          className="modal-overlay"
          onClick={() => !saving && setShowClaimModal(false)}
        >
          <form
            className="modal"
            onSubmit={submitClaim}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>File Warranty Claim</h2>
              <button
                type="button"
                className="close-btn"
                disabled={saving}
                onClick={() => setShowClaimModal(false)}
              >
                <X />
              </button>
            </div>

            <label>Select Product *</label>
            <select
              required
              value={claimForm.productId}
              onChange={e => setClaimForm({ ...claimForm, productId: e.target.value })}
            >
              <option value="">-- Choose a registered product --</option>
              {products.map(p => {
                const details = getWarrantyDetails(p.warrantyEnd);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.brand}) • {details.status} ({details.label})
                  </option>
                );
              })}
            </select>

            <label>Issue / Defect Title *</label>
            <input
              required
              placeholder="e.g. Screen flickering with green line"
              value={claimForm.issue}
              onChange={e => setClaimForm({ ...claimForm, issue: e.target.value })}
            />

            <label>Detailed Description</label>
            <textarea
              rows={4}
              placeholder="Describe when the issue started, how it affects usage, and if the brand/service center has refused or delayed repairs..."
              value={claimForm.description}
              onChange={e => setClaimForm({ ...claimForm, description: e.target.value })}
              style={{
                padding: 12,
                border: "1px solid #dfe5ee",
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical"
              }}
            />

            <button
              type="submit"
              className="primary-btn submit-btn"
              disabled={saving}
            >
              {saving ? "Submitting..." : "Submit Claim"}
            </button>
          </form>
        </div>
      )}

      {/* AI LEGAL NOTICE & CLAIM LETTER MODAL */}
      {showLegalModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowLegalModal(false)}
        >
          <div
            className="modal modal-large"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={20} color="#2563eb" />
                <h2>AI Consumer Legal Notice Package</h2>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowLegalModal(false)}
              >
                <X />
              </button>
            </div>

            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>
              Formatted in accordance with the <b>Consumer Protection Act, 2019</b> and National Consumer Helpline guidelines.
            </p>

            {generatingLegal ? (
              <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
                <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 12px", color: "#2563eb" }} />
                <p>ClaimSaathi AI is formulating your formal legal notice package...</p>
              </div>
            ) : (
              <>
                <pre className="legal-preview">
                  {legalData?.legal_package || "No content generated."}
                </pre>

                <div className="modal-actions">
                  <button
                    className="outline-btn"
                    onClick={printLegalNotice}
                    title="Print or Save as PDF"
                  >
                    <Printer size={16} /> Print / Save PDF
                  </button>

                  <button
                    className="outline-btn"
                    onClick={copyLegalText}
                  >
                    {copied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
                    {copied ? "Copied to Clipboard!" : "Copy Full Notice"}
                  </button>

                  <button
                    className="primary-btn"
                    onClick={() => setShowLegalModal(false)}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* EXTRACTED INVOICE DETAILS MODAL */}
      {showExtractedModal && extractedData && (
        <div
          className="modal-overlay"
          onClick={() => setShowExtractedModal(false)}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={20} color="#2563eb" />
                <h2>Extracted Invoice Details</h2>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowExtractedModal(false)}
              >
                <X />
              </button>
            </div>

            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 8px" }}>
              Extracted via <b>Google Gemini AI</b> from <b>{extractedData.sourceFilename}</b>
            </p>

            {extractedData.summary && (
              <div className="extracted-summary">
                <strong>AI Summary:</strong> {extractedData.summary}
              </div>
            )}

            <div className="extracted-details-grid">
              <div className="extracted-item">
                <small>Product Name</small>
                <strong>{extractedData.name || "Not detected"}</strong>
              </div>

              <div className="extracted-item">
                <small>Brand / Manufacturer</small>
                <strong>{extractedData.brand || "Not specified"}</strong>
              </div>

              <div className="extracted-item">
                <small>Purchase Date</small>
                <strong>{formatDate(extractedData.purchase_date)}</strong>
              </div>

              <div className="extracted-item">
                <small>Warranty Duration</small>
                <strong>{extractedData.warranty_months} Months</strong>
              </div>

              <div className="extracted-item">
                <small>Purchase Price</small>
                <strong>{formatPrice(extractedData.purchase_price)}</strong>
              </div>

              <div className="extracted-item">
                <small>Retailer / Platform</small>
                <strong>{extractedData.retailer || "N/A"}</strong>
              </div>

              <div className="extracted-item" style={{ gridColumn: "span 2" }}>
                <small>Invoice / Bill Number</small>
                <strong>{extractedData.invoice_no || "N/A"}</strong>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setProductForm({
                    name: extractedData.name || "",
                    brand: extractedData.brand || "",
                    purchaseDate: extractedData.purchase_date || "",
                    warrantyMonths: String(extractedData.warranty_months || 12),
                    price: extractedData.purchase_price ? String(extractedData.purchase_price) : "",
                    retailer: extractedData.retailer || "",
                    invoiceNo: extractedData.invoice_no || ""
                  });
                  setScannedDocId(extractedData.sourceDocId);
                  setShowExtractedModal(false);
                  setShowProductModal(true);
                }}
              >
                <Plus size={16} /> Register as Product
              </button>

              <button
                type="button"
                className="outline-btn"
                onClick={() => setShowExtractedModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// STAT CARD
function Stat({ icon: Icon, title, value }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        <Icon size={21} />
      </div>
      <p>{title}</p>
      <h2>{value}</h2>
    </div>
  );
}

// EMPTY STATE
function EmptyProducts({ onAdd }) {
  return (
    <div className="empty-state">
      <Package size={40} />
      <h3>No products registered</h3>
      <p>Add a product manually or scan your invoice with Gemini AI.</p>
      <button className="primary-btn" onClick={onAdd}>
        <Plus size={17} /> Add your first product
      </button>
    </div>
  );
}

// PRODUCT ITEM
function ProductItem({ product: p, onEdit }) {
  const details = getWarrantyDetails(p.warrantyEnd);

  return (
    <div className="product-item">
      <div className="product-icon">
        <Smartphone />
      </div>

      <div className="product-info">
        <strong>{p.name}</strong>
        <small>{p.brand || "Brand unspecified"} • Ends: {formatDate(p.warrantyEnd)}</small>
        <small>Price: {formatPrice(p.price)}</small>
      </div>

      <span className={`status ${details.badgeClass}`}>
        {details.status}
        <span className="badge-days">• {details.label}</span>
      </span>

      {onEdit && (
        <button
          className="edit-btn"
          title="Edit Product"
          onClick={() => onEdit(p)}
        >
          <Edit size={15} />
        </button>
      )}
    </div>
  );
}

// MARKDOWN CHAT MESSAGE RENDERER
function FormattedMessage({ text }) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div className="chat-markdown">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (trimmed.startsWith("### ")) {
          return <h4 key={idx}>{trimmed.slice(4)}</h4>;
        }
        if (trimmed.startsWith("## ")) {
          return <h3 key={idx}>{trimmed.slice(3)}</h3>;
        }
        if (trimmed.startsWith("# ")) {
          return <h3 key={idx}>{trimmed.slice(2)}</h3>;
        }
        if (trimmed === "---" || trimmed === "***") {
          return <hr key={idx} />;
        }
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          const content = trimmed.slice(2);
          return (
            <ul key={idx}>
              <li>{renderInline(content)}</li>
            </ul>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const content = trimmed.replace(/^\d+\.\s*/, "");
          return (
            <ol key={idx}>
              <li>{renderInline(content)}</li>
            </ol>
          );
        }
        if (!trimmed) {
          return <div key={idx} style={{ height: 6 }} />;
        }

        return <p key={idx}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

// Render inline bold (**text**)
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// AI ASSISTANT (WITH PERSISTENT PROPS)
function Assistant({ userProfile, messages, setMessages, onClearChat }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  const suggestedQueries = [
    "Which of my products are under warranty?",
    "My smartphone screen has a green line, is it covered?",
    "How to file a complaint on National Consumer Helpline (1915)?",
    "What are my rights if a company denies warranty repair?"
  ];

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (queryText) => {
    const textToSend = (queryText || message).trim();
    if (!textToSend || loading) return;

    const newMessages = [
      ...messages,
      { role: "user", text: textToSend }
    ];
    setMessages(newMessages);
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          history: newMessages.slice(-6)
        })
      });

      if (!response.ok) {
        throw new Error("Could not get a response from ClaimSaathi AI.");
      }

      const data = await response.json();
      setMessages(prev => [
        ...prev,
        { role: "assistant", text: data.reply }
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          text: "⚠️ Unable to connect to ClaimSaathi AI backend. Please verify your server is running on port 8000."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel page-content">
      <div className="panel-heading">
        <div>
          <h2>ClaimSaathi AI Consumer Advocate</h2>
          <p>Context-aware assistant for {userProfile.name} with live access to your warranty registry.</p>
        </div>

        <button
          className="outline-btn"
          style={{ padding: "6px 12px", fontSize: 12 }}
          title="Clear Conversation History"
          onClick={onClearChat}
        >
          <RotateCcw size={14} /> Clear Chat
        </button>
      </div>

      {/* SUGGESTED QUERIES */}
      <div className="chat-chips">
        {suggestedQueries.map((q, idx) => (
          <button
            key={idx}
            className="chip-btn"
            onClick={() => handleSend(q)}
            disabled={loading}
          >
            ✦ {q}
          </button>
        ))}
      </div>

      <div className="chat-messages">
        {messages.map((item, index) => (
          <div key={index} className={`chat-message ${item.role}`}>
            {item.role === "assistant" ? (
              <FormattedMessage text={item.text} />
            ) : (
              <p>{item.text}</p>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-message assistant">
            <p>✦ ClaimSaathi AI is analyzing your consumer rights...</p>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask about warranties, Indian consumer laws, or complaints..."
        />
        <button type="submit" disabled={loading}>
          Send
        </button>
      </form>

      <small style={{ display: "block", marginTop: 12, color: "#8994a6" }}>
        Powered by Google Gemini 3.5 Flash-Lite • Grounded in Consumer Protection Act, 2019
      </small>
    </section>
  );
}
