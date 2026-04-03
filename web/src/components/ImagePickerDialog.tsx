import { useState } from "react";
import { uploadRecipeImage } from "../api/recipes";

interface Props {
  onSelect: (imageUrl: string) => void;
  onClose: () => void;
}

type Tab = "url" | "upload";

export function ImagePickerDialog({ onSelect, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("url");
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const url = await uploadRecipeImage(file);
      if (!url) {
        setUploadError("Failed to upload image.");
        return;
      }
      onSelect(url);
      onClose();
    } catch {
      setUploadError("Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-title">Recipe Image</p>
        <div className="image-picker-tabs">
          <button
            type="button"
            className={`btn btn-sm ${tab === "url" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setTab("url");
              setUploadError("");
            }}
          >
            Image URL
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === "upload" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setTab("upload");
              setUploadError("");
            }}
          >
            Upload Image
          </button>
        </div>

        {tab === "url" && (
          <div className="form-group">
            <input
              id="imagePickerUrl"
              type="url"
              className="input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.jpg"
              autoFocus
            />
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!urlInput.trim()}
                onClick={() => {
                  onSelect(urlInput.trim());
                  onClose();
                }}
              >
                Use URL
              </button>
            </div>
          </div>
        )}

        {tab === "upload" && (
          <div className="form-group">
            <input
              id="imageUpload"
              type="file"
              accept="image/*"
              className="input"
              aria-label="Upload image file"
              disabled={uploading}
              onChange={handleFileChange}
            />
            {uploading && <p className="field-hint">Uploading...</p>}
            {uploadError && <p className="field-error">{uploadError}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
