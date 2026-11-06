"use strict";

window.ScorecardStorage = {
  mode: "mock-sharepoint",
  session: null,

  async initialize() {
    const [sessionResponse, stateResponse] = await Promise.all([
      fetch("/mock-api/session", { cache: "no-store" }),
      fetch("/mock-api/state", { cache: "no-store" }),
    ]);
    if (!sessionResponse.ok) throw new Error("The mock SharePoint session is unavailable.");
    this.session = await sessionResponse.json();
    const saved = stateResponse.ok ? await stateResponse.json() : { state: null };
    return saved.state;
  },

  canWrite() {
    return this.session?.role !== "viewer";
  },

  async saveState(state) {
    if (!this.canWrite()) return;
    const response = await fetch("/mock-api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Shared state could not be saved.");
  },

  async putFile(id, file) {
    if (!this.canWrite()) throw new Error("Viewer role is read-only.");
    const response = await fetch(`/mock-api/files/${encodeURIComponent(id)}`, { method: "PUT", body: file });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "File could not be uploaded.");
  },

  async getFile(id, metadata = {}) {
    const response = await fetch(`/mock-api/files/${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    return new File([await response.blob()], metadata.name || "reference-file", { type: metadata.type || "application/octet-stream" });
  },

  async deleteFile(id) {
    if (!this.canWrite()) throw new Error("Viewer role is read-only.");
    const response = await fetch(`/mock-api/files/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "File could not be removed.");
  },
};
