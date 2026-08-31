"use client";

export interface SavedCharacter {
  id: string;
  name: string;
  assetIds: string[];
}

export interface ReferencePickerProps {
  /** Distinguishes the file input across modes; ids must be unique per page. */
  inputId: string;
  label: string;
  hint: string;
  /** How the prompt addresses a selected reference, e.g. "image 1" or "Image 1". */
  promptHint: string;
  pickableImageIds: readonly string[];
  selectedIds: readonly string[];
  characters: readonly SavedCharacter[];
  characterName: string;
  disabled: boolean;
  uploading: boolean;
  savingCharacter: boolean;
  uploadError: string | null;
  characterError: string | null;
  onUpload(event: React.ChangeEvent<HTMLInputElement>): void;
  onToggle(assetId: string): void;
  onLoadCharacter(assetIds: readonly string[]): void;
  onDeleteCharacter(characterId: string): void;
  onCharacterNameChange(name: string): void;
  onSaveCharacter(): void;
}

/**
 * Ordered reference images plus the saved-character shelf.
 *
 * Shared by Image and Video rather than duplicated: a saved identity that only
 * works in one tab is not a saved identity, and two copies of this markup would
 * drift the moment either mode changed.
 */
export function ReferencePicker({
  inputId,
  label,
  hint,
  promptHint,
  pickableImageIds,
  selectedIds,
  characters,
  characterName,
  disabled,
  uploading,
  savingCharacter,
  uploadError,
  characterError,
  onUpload,
  onToggle,
  onLoadCharacter,
  onDeleteCharacter,
  onCharacterNameChange,
  onSaveCharacter,
}: ReferencePickerProps) {
  return (
    <div className="mt-3">
      <p className="rule-cap mb-2">
        <span>
          {label} <span className="normal-case tracking-normal">{hint}</span>
        </span>
      </p>

      <div className="strip-scroll flex gap-2 overflow-x-auto pb-1">
        <label
          htmlFor={inputId}
          className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border border-dashed text-[10px] transition-colors ${
            disabled || uploading
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:border-[var(--border-strong)]"
          }`}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {uploading ? (
            <span className="spinner h-4 w-4" aria-hidden="true" />
          ) : (
            <>
              <span className="text-base leading-none">+</span>
              <span>Upload</span>
            </>
          )}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onUpload}
          disabled={disabled || uploading}
          className="sr-only"
        />

        {pickableImageIds.map((assetId) => {
          const order = selectedIds.indexOf(assetId);
          const selected = order !== -1;
          return (
            <button
              key={assetId}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={
                selected ? `Reference ${order + 1}, click to remove` : "Add as reference"
              }
              onClick={() => onToggle(assetId)}
              className="relative shrink-0 overflow-hidden rounded-[10px] transition-all disabled:opacity-50"
              style={{
                border: selected
                  ? "2px solid var(--accent-via)"
                  : "2px solid var(--border)",
              }}
            >
              <img src={`/api/assets/${assetId}`} alt="" className="h-16 w-16 object-cover" />
              {selected && (
                // The number is the position the prompt addresses — selection
                // order is send order.
                <span
                  className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-[10px] text-[10px] font-bold text-white"
                  style={{ background: "var(--accent-via)" }}
                >
                  {order + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {uploadError !== null && (
        <p className="mt-1.5 text-[11px] text-[var(--danger)]">{uploadError}</p>
      )}
      {selectedIds.length > 0 && (
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{promptHint}</p>
      )}

      {characters.length > 0 && (
        <div className="mt-3">
          <p className="rule-cap mb-2">
            Saved characters
          </p>
          <div className="flex flex-wrap gap-2">
            {characters.map((character) => (
              <span
                key={character.id}
                className="inline-flex items-center gap-1 rounded-[10px] border px-1 py-0.5 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoadCharacter(character.assetIds)}
                  className="rounded-[10px] px-2 py-0.5 text-[var(--text)] disabled:opacity-50"
                  title={`Load ${character.assetIds.length} reference image(s)`}
                >
                  {character.name}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDeleteCharacter(character.id)}
                  aria-label={`Delete character ${character.name}`}
                  className="px-1 text-[var(--text-faint)] hover:text-[var(--danger)] disabled:opacity-50"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={characterName}
            onChange={(event) => onCharacterNameChange(event.target.value)}
            disabled={disabled || savingCharacter}
            maxLength={60}
            placeholder="Name this character…"
            className="input-field !w-48 !py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={onSaveCharacter}
            disabled={disabled || savingCharacter || characterName.trim().length === 0}
            className="btn-secondary gap-1.5 !px-3 !py-1.5 text-xs"
          >
            {savingCharacter && <span className="spinner h-3 w-3" aria-hidden="true" />}
            Save {selectedIds.length} as character
          </button>
        </div>
      )}
      {characterError !== null && (
        <p className="mt-1.5 text-[11px] text-[var(--danger)]">{characterError}</p>
      )}
    </div>
  );
}
