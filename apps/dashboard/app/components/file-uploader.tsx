"use client";

import { type DragEvent, type ChangeEvent, useState } from "react";

export function FileUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setStatus("idle");
      setMessage("");
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus("idle");
      setMessage("");
    }
  };

  const uploadFile = async () => {
    if (!file) return;
    setStatus("uploading");
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/ingestion/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json() as { error?: string; status?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to upload file.");
      }

      setStatus("success");
      setMessage(`Successfully uploaded ${file.name}! Processing started.`);
      setFile(null);
      
      // Trigger topology refresh immediately
      window.dispatchEvent(new Event("uios:refresh-topology"));
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message ?? "An error occurred during upload.");
    }
  };

  return (
    <section className="file-uploader" style={{
      background: "rgba(255, 255, 255, 0.02)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
    }}>
      <div style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: 10,
        fontWeight: "bold",
        letterSpacing: "0.1em",
        color: "#8cacff",
        textTransform: "uppercase",
        marginBottom: 10,
      }}>
        Ingest Knowledge Document
      </div>
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          border: "1px dashed rgba(255, 255, 255, 0.15)",
          borderRadius: 8,
          padding: "20px 10px",
          textAlign: "center",
          cursor: "pointer",
          background: "rgba(0, 0, 0, 0.15)",
          transition: "border-color 0.2s ease",
          marginBottom: 12,
        }}
      >
        <input
          type="file"
          id="file-input"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <label htmlFor="file-input" style={{ cursor: "pointer", display: "block" }}>
          {file ? (
            <div style={{ color: "#fff", fontSize: 12 }}>
              📄 <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
            </div>
          ) : (
            <div style={{ color: "#7d8ea7", fontSize: 11 }}>
              Drag & drop document or <span style={{ color: "#8cacff", textDecoration: "underline" }}>browse</span>
            </div>
          )}
        </label>
      </div>

      {file && (
        <button
          onClick={uploadFile}
          disabled={status === "uploading"}
          style={{
            width: "100%",
            background: "#1c64f2",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            padding: "8px 12px",
            fontSize: 11,
            fontWeight: "bold",
            cursor: "pointer",
            transition: "background 0.2s ease",
          }}
        >
          {status === "uploading" ? "Uploading & Ingesting..." : "Ingest Document"}
        </button>
      )}

      {message && (
        <div style={{
          marginTop: 10,
          fontSize: 11,
          color: status === "success" ? "#10b981" : "#ef4444",
          fontFamily: "ui-monospace, monospace",
          lineHeight: 1.4,
        }}>
          {message}
        </div>
      )}
    </section>
  );
}
