import type React from "react";

// ─── Color maps for card display ───
export const LIGHT_COLORS: Record<string, string> = {
  red: "#FF5555",
  yellow: "#FFAA00",
  green: "#55AA55",
  blue: "#5555FF",
  wild: "#222222",
};

export const DARK_COLORS: Record<string, string> = {
  pink: "#FF69B4",
  teal: "#008080",
  orange: "#FF8C00",
  purple: "#8B008B",
  wild: "#222222",
};

// ─── Shared styles ───
export const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 24,
    fontFamily: "system-ui",
    maxWidth: 400,
    margin: "0 auto",
    textAlign: "center",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 40,
    margin: "0 0 8px",
  },
  subtitle: {
    color: "#888",
    margin: "0 0 32px",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 18,
    borderRadius: 8,
    border: "2px solid #333",
    backgroundColor: "#16213e",
    color: "#eee",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 16,
    textAlign: "center",
  },
  primaryButton: {
    width: "100%",
    padding: "14px 24px",
    fontSize: 18,
    fontWeight: "bold",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#e74c3c",
    color: "white",
    cursor: "pointer",
  },
  roomCodeBox: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 24,
  },
  roomCodeLabel: {
    color: "#888",
    fontSize: 14,
    margin: 0,
  },
  roomCode: {
    fontSize: 48,
    fontWeight: "bold",
    letterSpacing: 8,
    margin: "8px 0",
  },
  roomCodeHint: {
    color: "#666",
    fontSize: 13,
    margin: 0,
  },
  section: {
    textAlign: "left",
    width: "100%",
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  playerList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  playerItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#16213e",
    borderRadius: 8,
    marginBottom: 6,
    fontSize: 16,
  },
  hostBadge: {
    fontSize: 11,
    fontWeight: "bold",
    backgroundColor: "#e74c3c",
    color: "white",
    padding: "2px 8px",
    borderRadius: 4,
  },
  youBadge: {
    fontSize: 11,
    fontWeight: "bold",
    backgroundColor: "#2ecc71",
    color: "white",
    padding: "2px 8px",
    borderRadius: 4,
  },
};
