"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import styles from "./universe-experience.module.css";

export type UserProfile = {
  name: string;
  email: string;
  company?: string;
  hasFiles: boolean;
};

export type OnboardingModalProps = {
  onComplete: (profile: UserProfile) => void;
  onDismiss: () => void;
};

export function OnboardingModal({ onComplete, onDismiss }: OnboardingModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [hasFiles, setHasFiles] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    onComplete({ name, email, company, hasFiles });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={styles.modalBackdrop}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <motion.form
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onSubmit={handleSubmit}
        style={{
          background: "linear-gradient(145deg, rgba(13, 22, 45, 0.95), rgba(4, 10, 28, 0.98))",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "16px",
          padding: "32px",
          width: "440px",
          maxWidth: "90vw",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(100, 150, 255, 0.1) inset"
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: 600, background: "linear-gradient(90deg, #fff, #9bdfff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Initialize your Identity
          </h2>
          <p style={{ margin: 0, fontSize: "14px", color: "rgba(255,255,255,0.7)" }}>
            Establish a connection to the Fabric of Intelligence to generate your personal coordinate space.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#a5b4fc" }}>
            Designation (Name)
            <input
              required
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: "10px 14px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", outline: "none" }}
              placeholder="E.g., Architect"
            />
          </label>
          
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#a5b4fc" }}>
            Communication Vector (Email)
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: "10px 14px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", outline: "none" }}
              placeholder="you@domain.com"
            />
          </label>
          
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#a5b4fc" }}>
            Alliance / Company (Optional)
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={{ padding: "10px 14px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", outline: "none" }}
              placeholder="Corporate entity"
            />
          </label>
          
          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#a5b4fc", cursor: "pointer", marginTop: "4px" }}>
            <input
              type="checkbox"
              checked={hasFiles}
              onChange={(e) => setHasFiles(e.target.checked)}
              style={{ width: "16px", height: "16px", accentColor: "#35c8ff", cursor: "pointer" }}
            />
            I have knowledge artifacts (files) to upload
          </label>
        </div>

        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", color: "#fff", cursor: "pointer", fontSize: "14px", transition: "background 0.2s" }}
            onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
            onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
          >
            Skip
          </button>
          <button
            type="submit"
            style={{ flex: 2, padding: "12px", background: "linear-gradient(90deg, #35c8ff, #763cff)", border: "none", borderRadius: "8px", color: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: 600, boxShadow: "0 4px 12px rgba(53, 200, 255, 0.3)", transition: "transform 0.1s" }}
            onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
            onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
          >
            Initialize Star
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
