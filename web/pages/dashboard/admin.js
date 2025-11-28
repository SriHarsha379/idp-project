import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import FloatingSearch from "../../components/FloatingSearch";
import FloatingChat from "../../components/FloatingChat";


export default function Home() {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userName, setUserName] = useState("");

    const [file, setFile] = useState(null);
    const [taskId, setTaskId] = useState(null);
    const [status, setStatus] = useState("PENDING");
    const [uploadedTable, setUploadedTable] = useState([]);
    const [extractedTable, setExtractedTable] = useState([]);

    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState("Upload a file to start processing.");
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [editingRowIndex, setEditingRowIndex] = useState(null);
    const [currentEditData, setCurrentEditData] = useState(null);
    const [newlyExtractedIds, setNewlyExtractedIds] = useState(new Set());

    // ✅ AUTHENTICATION CHECK
    useEffect(() => {
      const email = sessionStorage.getItem("userEmail");
      const name = sessionStorage.getItem("userName");

      if (!email) {
        router.push("/login");
      } else {
        setIsAuthenticated(true);
        setUserName(name || email);
      }
    }, [router]);

    // ✅ LOGOUT FUNCTION
    const handleLogout = () => {
      sessionStorage.clear();
      router.push("/auth/login");
    };

// FETCH DATA FROM DB
    const fetchData = useCallback(async (markAsNew = false, showMessage = false) => {
        if (!isAuthenticated) return;

        setIsLoading(true);
        if (showMessage) {
            setMessage("Loading existing data from database...");
        }

        try {
            const res = await fetch("http://127.0.0.1:5000/api/get-all-docs");

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(`Failed to fetch documents. Status: ${res.status}. Detail: ${errorData.detail || 'Unknown server error'}`);
            }

            const data = await res.json();
            const records = data.records || [];

            // Mark newly extracted records
            if (markAsNew && records.length > extractedTable.length) {
                const newIds = new Set();
                const existingIds = new Set(extractedTable.map(r => r.id));
                records.forEach(record => {
                    if (!existingIds.has(record.id)) {
                        newIds.add(record.id);
                    }
                });
                setNewlyExtractedIds(newIds);

                // Auto-clear highlighting after 5 seconds
                setTimeout(() => {
                    setNewlyExtractedIds(new Set());
                }, 5000);
            }

            setExtractedTable(records);
            if (showMessage) {
                setMessage("Data loaded successfully.");
            }
        } catch (error) {
            console.error("Database Fetch Error:", error);

            if (error.message.includes('404')) {
                setMessage("⚠️ Backend endpoint /api/get-all-docs not found. Please implement it first.");
            } else {
                setMessage(`❌ Error loading data: ${error.message}`);
            }

            setExtractedTable([]);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchData(false, false); // Silent initial load
        }
    }, [isAuthenticated]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Load uploadedTable from localStorage
    useEffect(() => {
      const savedUploads = localStorage.getItem("uploadedTable");
      if (savedUploads) {
        setUploadedTable(JSON.parse(savedUploads));
      }
    }, []);

    // Save uploadedTable whenever it changes
    useEffect(() => {
      localStorage.setItem("uploadedTable", JSON.stringify(uploadedTable));
    }, [uploadedTable]);

    const handleFileChange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      setFile(f);
      const sizeInKB = (f.size / 1024).toFixed(2);
      const newFile = {
        id: Date.now(),
        name: f.name,
        size: sizeInKB + " KB",
        uploadedAt: new Date().toLocaleTimeString()
      };
      setUploadedTable(prev => [...prev, newFile]);
      setTaskId(null); setProgress(0); setStatus("PENDING");
      setMessage("File selected. Ready to upload.");
    };

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (e) => {
      e.preventDefault(); setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (!f || !["application/pdf", "image/jpeg", "image/png"].includes(f.type)) return;
      setFile(f);
      const sizeInKB = (f.size / 1024).toFixed(2);
      const newFile = {
        id: Date.now(),
        name: f.name,
        size: sizeInKB + " KB",
        uploadedAt: new Date().toLocaleTimeString()
      };
      setUploadedTable(prev => [...prev, newFile]);
      setTaskId(null); setProgress(0); setStatus("PENDING");
      setMessage("File selected. Ready to upload.");
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!file) return;

      setStatus("STARTED");
      setMessage("Uploading & starting extraction...");

      const formData = new FormData();
      formData.append("document", file);

      try {
          const res = await fetch("/api/process-doc", { method: "POST", body: formData });
          const data = await res.json();

          if (!res.ok) {
              throw new Error(data.detail || `Upload failed: ${res.statusText}`);
          }

          setTaskId(data.taskId);
          setStatus("PROCESSING");
          pollStatus(data.taskId);
      } catch (error) {
          setMessage(`❌ Upload failed: ${error.message}`);
          setStatus("FAILURE");
      }
    };

    const pollStatus = (id) => {
      const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/status?taskId=${id}`);
            const data = await res.json();

            if (data.status === "SUCCESS" || data.status === "FAILURE") {
              clearInterval(interval);
              setStatus(data.status);

              if (data.status === "SUCCESS") {
                setMessage("✅ Processing Complete. Refreshing data from database...");
                setProgress(100);
                fetchData(true); // Mark new records
              } else {
                setMessage(`❌ Processing Failed: ${data.result?.error || 'Unknown error'}`);
              }
              return;
            }

            if (data.progress) {
              const { current, total } = data.progress;
              setProgress(Math.round((current / total) * 100));
              setMessage(`Processing page ${current} of ${total}...`);
            } else if (data.status === "PROCESSING") {
                setMessage("Extraction in progress...");
            }

        } catch (error) {
            clearInterval(interval);
            setStatus("FAILURE");
            setMessage(`❌ Error polling status: ${error.message}`);
        }
      }, 2000);
    };

    const handleEdit = (rowIndex, rowData) => {
      const originalKeyMap = getOriginalKeyMap();
      const mappedData = {};
      for (const displayKey in rowData) {
          const originalKey = originalKeyMap[displayKey];
          if (originalKey) {
              mappedData[originalKey] = rowData[displayKey];
          } else {
              mappedData[displayKey] = rowData[displayKey];
          }
      }

      setEditingRowIndex(rowIndex);
      setCurrentEditData({ ...rowData });
    };

    const handleEditChange = (key, value) => {
      setCurrentEditData(prev => ({
        ...prev,
        [key]: value
      }));
    };

    const getOriginalKeyMap = () => ({
        "Page": "page_number", "Doc Type": "Extracted_From", "Principal Company": "Principal_Company",
        "LR No": "lr_no", "LR Date": "lr_date", "Invoice No": "invoice_no", "Invoice Date": "invoice_date",
        "Vehicle No": "truck_no", "Bill To": "bill_to_party", "Ship To": "ship_to_party",
        "Origin": "origin", "Destination": "destination", "Order Type": "order_type",
        "Origin Slip": "origin_weighment_slip", "Site Slip": "site_weighment_slip", "Acknowledged": "acknowledgement_status",
    });

    const handleSave = async () => {
      if (editingRowIndex === null || !currentEditData) return;

      const originalRecord = extractedTable[editingRowIndex];
      const docId = originalRecord.id;

      if (!docId) {
          setMessage("Error: Database ID missing for this record. Cannot save to backend.");
          handleCancel();
          return;
      }

      const originalKeyMap = getOriginalKeyMap();
      const payload = {};
      const updatedRecord = { ...originalRecord };

      for (const displayKey in currentEditData) {
          const originalKey = originalKeyMap[displayKey];
          if (originalKey) {
              const value = currentEditData[displayKey];
              payload[originalKey] = value === "-" || value === "" ? null : value;
              updatedRecord[originalKey] = value === "-" || value === "" ? null : value;
          }
      }

      try {
          setMessage("Saving changes to database...");

          const res = await fetch(`http://127.0.0.1:5000/api/extracted-doc/${docId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || `Failed to save: ${res.statusText}`);

          fetchData();
          setMessage("✅ Changes saved successfully.");
      } catch (error) {
          console.error("Save Error:", error);
          setMessage(`❌ Save failed: ${error.message}`);
      }

      setEditingRowIndex(null);
      setCurrentEditData(null);
    };

    const handleCancel = () => {
      setMessage("Edit cancelled.");
      setEditingRowIndex(null);
      setCurrentEditData(null);
    };

    const renderTable = (title, data, columns, emoji, isEditable = false) => {
      const getDisplayKeyMap = () => ({
          "page_number": "Page", "Extracted_From": "Doc Type", "Principal_Company": "Principal Company",
          "lr_no": "LR No", "lr_date": "LR Date", "invoice_no": "Invoice No", "invoice_date": "Invoice Date",
          "truck_no": "Vehicle No", "bill_to_party": "Bill To", "ship_to_party": "Ship To",
          "origin": "Origin", "destination": "Destination", "order_type": "Order Type",
          "origin_weighment_slip": "Origin Slip", "site_weighment_slip": "Site Slip", "acknowledgement_status": "Acknowledged"
      });

      const displayKeyMap = getDisplayKeyMap();
      const allColumns = isEditable ? [...columns, "Actions"] : columns;

      const mappedData = data.map(item => {
          const newItem = { id: item.id };
          for (const dbKey in item) {
              const displayKey = displayKeyMap[dbKey];
              if (displayKey) {
                  newItem[displayKey] = item[dbKey];
              } else {
                  newItem[dbKey] = item[dbKey];
              }
          }
          return newItem;
      });

      return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b flex items-center gap-3">
            <span className="text-2xl">{emoji}</span>
            <h2 className="text-lg font-bold text-gray-800">{title}</h2>
            <span className="ml-auto bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
              {data.length} items
            </span>
          </div>

          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>{allColumns.map(c =>
                  <th key={c} className="px-4 py-3 text-left font-semibold text-gray-700 uppercase text-xs border-b-2">{c}</th>
                )}</tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
              {mappedData.length === 0 ? (
                <tr><td colSpan={allColumns.length} className="text-center text-gray-400 py-8">No data</td></tr>
              ) : (
                mappedData.map((row, i) => {
                  const isEditing = i === editingRowIndex && isEditable;
                  const isNewlyExtracted = newlyExtractedIds.has(row.id);

                  return (
                    <tr
                      key={i}
                      className={`hover:bg-blue-50 transition-colors ${
                        isEditing ? 'bg-yellow-50' :
                        isNewlyExtracted ? 'bg-green-100 animate-pulse' : ''
                      }`}
                    >
                      {columns.map(c => {
                        const displayValue = row[c] || "-";
                        const isNonEditable = ["Page", "Doc Type"].includes(c);

                        return (
                          <td key={c} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {isEditing && !isNonEditable ? (
                              <input
                                type="text"
                                value={currentEditData[c] || ""}
                                onChange={(e) => handleEditChange(c, e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                              />
                            ) : (
                              String(displayValue)
                            )}
                          </td>
                        );
                      })}

                      {isEditable && (
                        <td className="p-2 flex gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={handleSave} className="text-green-600 font-bold hover:text-green-700">Save</button>
                              <button onClick={handleCancel} className="text-red-600 font-bold hover:text-red-700">Cancel</button>
                            </>
                          ) : (
                            <button onClick={()=>handleEdit(i,row)} className="text-blue-600 underline hover:text-blue-800">Edit</button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
              </tbody>
            </table>
          </div>
        </div>
      );
    };

    if (!isAuthenticated) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin text-6xl mb-4">⏳</div>
            <p className="text-gray-600">Checking authentication...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl shadow-lg">
                <span className="text-3xl">📦</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Logistics OCR Dashboard</h1>
                <p className="text-sm text-gray-500">Automated document processing & extraction</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-gray-50 px-4 py-2 rounded-lg">
                <p className="text-sm font-semibold text-gray-700">👤 {userName}</p>
                <p className="text-xs text-gray-500">Admin</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-lg whitespace-nowrap"
              >
                🚪 Logout
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-white rounded-2xl shadow-lg border overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 text-white font-bold text-lg flex items-center gap-2">
              ⬆️ Upload Document
            </div>

            <div className="p-6 space-y-4">
              <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
                  ${isDragging ? "border-blue-500 bg-blue-50 scale-105" : "border-gray-300 hover:border-blue-500"}`}
              >
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
                <span className="text-5xl">{isDragging ? "📥" : "📂"}</span>
                <p className="font-semibold mt-2">{file ? file.name : "Click or drag PDF / Image to upload"}</p>
              </label>

              <button
                onClick={handleSubmit}
                disabled={!file || status === "PROCESSING"}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
              >
                🚀 Upload & Process
              </button>

              <p className="text-sm text-gray-600 mt-2">{message}</p>
              <div className="w-full h-3 bg-gray-200 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-blue-600 transition-all rounded-full" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>

          {renderTable("Uploaded Files", uploadedTable, ["name", "size", "uploadedAt"], "📄")}

          {renderTable(
            "Extracted Fields",
            extractedTable,
            [
              "Page", "Doc Type", "Principal Company", "LR No", "LR Date", "Invoice No", "Invoice Date",
              "Vehicle No", "Bill To", "Ship To", "Origin", "Destination",
              "Order Type", "Acknowledged"
            ],
            "📋",
            true
          )}
          <FloatingSearch />
          <FloatingSearch />
          <FloatingChat />
        </div>
      </div>
    );
}