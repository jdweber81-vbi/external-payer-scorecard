/**
 * IT handoff contract for a future SPFx web part.
 *
 * The SPFx wrapper supplies WebPartContext and maps these operations to:
 * - ExternalPayerScorecardState list: one current JSON state item or normalized list rows.
 * - ExternalPayerScorecardEvidence library: uploaded files plus client/metric metadata.
 * - EffectiveBasePermissions / SharePoint groups: canWrite and administrative controls.
 *
 * Authentication must come from SPFx context. Do not add personal credentials here.
 */
export interface ScorecardSession {
  role: "viewer" | "contributor" | "admin";
  mode: "sharepoint";
  sharedStorage: true;
}

export interface ScorecardFileMetadata {
  id: string;
  name: string;
  type?: string;
  clientIds?: number[];
  metricId?: string;
  purpose?: "client" | "general";
}

export interface ScorecardStorageProvider {
  initialize(): Promise<Record<string, unknown> | null>;
  canWrite(): boolean;
  saveState(state: Record<string, unknown>): Promise<void>;
  putFile(id: string, file: File, metadata?: ScorecardFileMetadata): Promise<void>;
  getFile(id: string, metadata?: ScorecardFileMetadata): Promise<File | null>;
  deleteFile(id: string): Promise<void>;
}

export class SharePointDataProvider implements ScorecardStorageProvider {
  public constructor(
    private readonly siteUrl: string,
    private readonly requestDigest: () => Promise<string>,
    private readonly writable: boolean,
  ) {}

  public canWrite(): boolean {
    return this.writable;
  }

  public async initialize(): Promise<Record<string, unknown> | null> {
    const response = await fetch(
      `${this.siteUrl}/_api/web/lists/getbytitle('ExternalPayerScorecardState')/items?$select=Id,Title,StateJson&$top=1`,
      { headers: { Accept: "application/json;odata=nometadata" }, credentials: "same-origin" },
    );
    if (!response.ok) throw new Error(`SharePoint state read failed: ${response.status}`);
    const data = await response.json();
    return data.value?.[0]?.StateJson ? JSON.parse(data.value[0].StateJson) : null;
  }

  public async saveState(state: Record<string, unknown>): Promise<void> {
    if (!this.writable) throw new Error("SharePoint access is read-only.");
    const digest = await this.requestDigest();
    const existing = await fetch(
      `${this.siteUrl}/_api/web/lists/getbytitle('ExternalPayerScorecardState')/items?$select=Id&$top=1`,
      { headers: { Accept: "application/json;odata=nometadata" }, credentials: "same-origin" },
    ).then(r => r.json());
    const id = existing.value?.[0]?.Id;
    const endpoint = id
      ? `${this.siteUrl}/_api/web/lists/getbytitle('ExternalPayerScorecardState')/items(${id})`
      : `${this.siteUrl}/_api/web/lists/getbytitle('ExternalPayerScorecardState')/items`;
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/json;odata=nometadata",
        "X-RequestDigest": digest,
        ...(id ? { "IF-MATCH": "*", "X-HTTP-Method": "MERGE" } : {}),
      },
      body: JSON.stringify({ Title: "Current", StateJson: JSON.stringify(state) }),
    });
    if (!response.ok) throw new Error(`SharePoint state save failed: ${response.status}`);
  }

  public async putFile(id: string, file: File): Promise<void> {
    if (!this.writable) throw new Error("SharePoint access is read-only.");
    const digest = await this.requestDigest();
    const safeName = `${id}__${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const response = await fetch(
      `${this.siteUrl}/_api/web/GetFolderByServerRelativeUrl('ExternalPayerScorecardEvidence')/Files/add(url='${encodeURIComponent(safeName)}',overwrite=true)`,
      { method: "POST", credentials: "same-origin", headers: { "X-RequestDigest": digest }, body: file },
    );
    if (!response.ok) throw new Error(`SharePoint upload failed: ${response.status}`);
  }

  public async getFile(id: string, metadata: ScorecardFileMetadata = { id, name: id }): Promise<File | null> {
    const response = await fetch(
      `${this.siteUrl}/_api/web/GetFolderByServerRelativeUrl('ExternalPayerScorecardEvidence')/Files?$filter=startswith(Name,'${id}__')&$select=ServerRelativeUrl,Name&$top=1`,
      { headers: { Accept: "application/json;odata=nometadata" }, credentials: "same-origin" },
    );
    if (!response.ok) return null;
    const match = (await response.json()).value?.[0];
    if (!match) return null;
    const download = await fetch(`${this.siteUrl}/_api/web/GetFileByServerRelativeUrl('${match.ServerRelativeUrl}')/$value`, { credentials: "same-origin" });
    if (!download.ok) return null;
    return new File([await download.blob()], metadata.name || match.Name, { type: metadata.type || "application/octet-stream" });
  }

  public async deleteFile(id: string): Promise<void> {
    if (!this.writable) throw new Error("SharePoint access is read-only.");
    const metadata = await fetch(
      `${this.siteUrl}/_api/web/GetFolderByServerRelativeUrl('ExternalPayerScorecardEvidence')/Files?$filter=startswith(Name,'${id}__')&$select=ServerRelativeUrl&$top=1`,
      { headers: { Accept: "application/json;odata=nometadata" }, credentials: "same-origin" },
    ).then(r => r.json());
    const url = metadata.value?.[0]?.ServerRelativeUrl;
    if (!url) return;
    const digest = await this.requestDigest();
    const response = await fetch(`${this.siteUrl}/_api/web/GetFileByServerRelativeUrl('${url}')`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-RequestDigest": digest, "IF-MATCH": "*", "X-HTTP-Method": "DELETE" },
    });
    if (!response.ok) throw new Error(`SharePoint delete failed: ${response.status}`);
  }
}
