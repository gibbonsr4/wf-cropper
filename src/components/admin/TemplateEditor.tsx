import { useState, useId, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfig } from "@/hooks/useConfig";
import type { CropHint, Template, TemplateOutput, AppConfig } from "@/types";
import { downloadBlob } from "@/utils/download";
import { generateId } from "@/utils/id";
import {
  validateTemplateConfig,
  type TemplateConfigError,
} from "@/utils/validation";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AspectGlyph } from "@/components/ui/aspect-glyph";
import { FormatBadge } from "@/components/ui/format-badge";

const PRESET_RATIOS = [
  { label: "16:9", value: [16, 9] as [number, number] },
  { label: "4:3", value: [4, 3] as [number, number] },
  { label: "3:2", value: [3, 2] as [number, number] },
  { label: "1:1", value: [1, 1] as [number, number] },
  { label: "2:3", value: [2, 3] as [number, number] },
  { label: "9:16", value: [9, 16] as [number, number] },
];

const FORMATS = ["webp", "jpeg", "png", "avif"] as const;

/**
 * Crop hint presets: bias the Suggest Crop algorithm toward likely subject
 * placement. `null` = no bias (pure saliency). Keep in sync with the same
 * list in WizardFlow.tsx.
 */
const CROP_HINT_OPTIONS: Array<{ value: CropHint; label: string }> = [
  { value: null, label: "None" },
  { value: "face-center", label: "Face — center" },
  { value: "face-top", label: "Face — top" },
  { value: "center", label: "Center" },
];

/** Small muted help text below a form field */
function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">
      {children}
    </p>
  );
}


function createEmptyOutput(_index: number): TemplateOutput {
  return {
    id: `output-${generateId()}`,
    name: "Output",
    aspectRatio: [16, 9],
    outputWidth: 1200,
    outputHeight: null,
    outputFormat: "webp",
    quality: 80,
    filenameKey: "output",
  };
}

export default function TemplateEditor() {
  const { config, saveConfig, saving, apiAvailable } = useConfig();
  const [templates, setTemplates] = useState<Template[]>(
    config?.templates ?? []
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle"
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(
    null
  );
  const [validationErrors, setValidationErrors] = useState<
    TemplateConfigError[]
  >([]);

  // ── Unsaved-changes tracking ─────────────────────────────────────
  // Serialized snapshot of the templates array at the last successful
  // save (or at initial mount). Stored in state so isDirty can be
  // derived during render without reading a ref's current value, which
  // React 19's rules disallow.
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>(
    () => JSON.stringify(config?.templates ?? [])
  );
  const currentSerialized = useMemo(
    () => JSON.stringify(templates),
    [templates]
  );
  const isDirty = currentSerialized !== lastSavedSnapshot;

  // Warn before leaving the page if there are unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the custom message; the mere presence of
      // preventDefault + returnValue triggers the browser's generic
      // "Leave site?" prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Stable ID prefix for form label association
  const idPrefix = useId();

  /** Helper: get validation errors for a specific field. */
  const fieldErrors = (ti: number, oi?: number, field?: string) =>
    validationErrors.filter(
      (e) =>
        e.templateIndex === ti &&
        (oi === undefined || e.outputIndex === oi) &&
        (field === undefined || e.field === field)
    );

  const addTemplate = () => {
    const newTemplate: Template = {
      id: `template-${generateId()}`,
      name: "",
      description: "",
      minInputWidth: null,
      minInputShortSide: null,
      outputs: [createEmptyOutput(0)],
    };
    setTemplates((prev) => [...prev, newTemplate]);
    setEditingIndex(templates.length);
  };

  const removeTemplate = (index: number) => {
    setTemplates((prev) => prev.filter((_, i) => i !== index));
    setEditingIndex(null);
  };

  const updateTemplate = (index: number, updates: Partial<Template>) => {
    setTemplates((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...updates } : t))
    );
  };

  const addOutput = (templateIndex: number) => {
    const template = templates[templateIndex];
    updateTemplate(templateIndex, {
      outputs: [
        ...template.outputs,
        createEmptyOutput(template.outputs.length),
      ],
    });
  };

  const removeOutput = (templateIndex: number, outputIndex: number) => {
    const template = templates[templateIndex];
    if (template.outputs.length <= 1) return;
    updateTemplate(templateIndex, {
      outputs: template.outputs.filter((_, i) => i !== outputIndex),
    });
  };

  const updateOutput = (
    templateIndex: number,
    outputIndex: number,
    updates: Partial<TemplateOutput>
  ) => {
    const template = templates[templateIndex];
    const newOutputs = template.outputs.map((o, i) =>
      i === outputIndex ? { ...o, ...updates } : o
    );
    updateTemplate(templateIndex, { outputs: newOutputs });
  };

  const buildConfig = (): AppConfig => ({
    templates,
    filenamePattern:
      config?.filenamePattern ??
      "{basename}__{filenameKey}__{width}x{height}.{ext}",
  });

  const runValidation = (): boolean => {
    const errors = validateTemplateConfig(templates);
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSaveConfig = async () => {
    if (!runValidation()) {
      setSaveStatus("error");
      setSaveError("Fix validation errors before saving.");
      return;
    }
    setSaveError(null);
    try {
      await saveConfig(buildConfig());
      // Refresh the dirty-tracking snapshot so the pill + beforeunload
      // stop firing now that we're in sync with the persisted config.
      setLastSavedSnapshot(JSON.stringify(templates));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDownloadConfig = () => {
    if (!runValidation()) return;
    const json = JSON.stringify(buildConfig(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, "config.json");
    // In static-only deployments, downloading IS the save path — the
    // user uploads the file to /config.json manually. Clear dirty so
    // the pill + beforeunload stop nagging. In API mode, Download is
    // just a backup; the server save (Save Config) is what counts.
    if (!apiAvailable) {
      setLastSavedSnapshot(JSON.stringify(templates));
    }
  };

  return (
    <div className="space-y-6">
      {templates.map((template, ti) => (
        <div
          key={template.id}
          className="rounded-lg border border-border p-4 space-y-3"
        >
          {editingIndex === ti ? (
            // Edit mode
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${idPrefix}-name-${ti}`}
                    className="text-xs text-muted-foreground"
                  >
                    Name
                  </label>
                  <input
                    id={`${idPrefix}-name-${ti}`}
                    type="text"
                    value={template.name}
                    onChange={(e) =>
                      updateTemplate(ti, { name: e.target.value })
                    }
                    aria-invalid={fieldErrors(ti, undefined, "name").length > 0 || undefined}
                    aria-describedby={fieldErrors(ti, undefined, "name").length > 0 ? `${idPrefix}-name-${ti}-err` : undefined}
                    className={cn(
                      "w-full rounded-md border bg-input text-foreground outline-none focus:border-blue px-3 py-1.5 text-sm",
                      fieldErrors(ti, undefined, "name").length > 0
                        ? "border-destructive"
                        : "border-border"
                    )}
                  />
                  {fieldErrors(ti, undefined, "name").map((e, i) => (
                    <p key={i} id={`${idPrefix}-name-${ti}-err`} className="text-[11px] text-destructive mt-0.5">
                      {e.message}
                    </p>
                  ))}
                </div>
                <div>
                  <label
                    htmlFor={`${idPrefix}-desc-${ti}`}
                    className="text-xs text-muted-foreground"
                  >
                    Description
                  </label>
                  <input
                    id={`${idPrefix}-desc-${ti}`}
                    type="text"
                    value={template.description}
                    onChange={(e) =>
                      updateTemplate(ti, { description: e.target.value })
                    }
                    className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${idPrefix}-minw-${ti}`}
                    className="text-xs text-muted-foreground"
                  >
                    Min. Width (px)
                  </label>
                  <input
                    id={`${idPrefix}-minw-${ti}`}
                    type="number"
                    placeholder="Optional"
                    value={template.minInputWidth ?? ""}
                    onChange={(e) =>
                      updateTemplate(ti, {
                        minInputWidth: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-3 py-1.5 text-sm"
                  />
                  <FieldHint>
                    Reject uploads narrower than this
                  </FieldHint>
                </div>
                <div>
                  <label
                    htmlFor={`${idPrefix}-mins-${ti}`}
                    className="text-xs text-muted-foreground"
                  >
                    Min. Short Side (px)
                  </label>
                  <input
                    id={`${idPrefix}-mins-${ti}`}
                    type="number"
                    placeholder="Optional"
                    value={template.minInputShortSide ?? ""}
                    onChange={(e) =>
                      updateTemplate(ti, {
                        minInputShortSide: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-3 py-1.5 text-sm"
                  />
                  <FieldHint>
                    Reject uploads where the shortest edge is below this
                    (orientation-agnostic)
                  </FieldHint>
                </div>
              </div>

              {/* Outputs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase">
                    Outputs
                  </h4>
                  <button
                    type="button"
                    onClick={() => addOutput(ti)}
                    className="rounded-[4px] px-2 py-1 text-xs text-primary hover:bg-raised focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    + Add Output
                  </button>
                </div>
                {template.outputs.map((output, oi) => (
                  <div
                    key={output.id}
                    className="rounded border border-border bg-muted/30 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        Output {oi + 1}
                      </span>
                      {template.outputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeOutput(ti, oi)}
                          className="rounded-[4px] px-2 py-1 text-xs text-destructive hover:bg-raised focus-visible:ring-2 focus-visible:ring-blue"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div>
                        <label
                          htmlFor={`${idPrefix}-oname-${ti}-${oi}`}
                          className="text-xs text-muted-foreground"
                        >
                          Display Name
                        </label>
                        <input
                          id={`${idPrefix}-oname-${ti}-${oi}`}
                          type="text"
                          value={output.name}
                          placeholder="e.g. Hero Banner"
                          onChange={(e) =>
                            updateOutput(ti, oi, { name: e.target.value })
                          }
                          aria-invalid={fieldErrors(ti, oi, "name").length > 0 || undefined}
                          aria-describedby={fieldErrors(ti, oi, "name").length > 0 ? `${idPrefix}-oname-${ti}-${oi}-err` : undefined}
                          className={cn(
                            "w-full rounded-md border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm",
                            fieldErrors(ti, oi, "name").length > 0 ? "border-destructive" : "border-border"
                          )}
                        />
                        {fieldErrors(ti, oi, "name").map((e, i) => (
                          <p key={i} id={`${idPrefix}-oname-${ti}-${oi}-err`} className="text-[11px] text-destructive mt-0.5">
                            {e.message}
                          </p>
                        ))}
                        <FieldHint>Label shown in the crop editor</FieldHint>
                      </div>
                      <div>
                        <label
                          htmlFor={`${idPrefix}-ratio-${ti}-${oi}`}
                          className="text-xs text-muted-foreground"
                        >
                          Aspect Ratio
                        </label>
                        <select
                          id={`${idPrefix}-ratio-${ti}-${oi}`}
                          value={`${output.aspectRatio[0]}:${output.aspectRatio[1]}`}
                          onChange={(e) => {
                            const preset = PRESET_RATIOS.find(
                              (r) =>
                                `${r.value[0]}:${r.value[1]}` === e.target.value
                            );
                            if (preset)
                              updateOutput(ti, oi, {
                                aspectRatio: preset.value,
                              });
                          }}
                          className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm"
                        >
                          {PRESET_RATIOS.map((r) => (
                            <option
                              key={r.label}
                              value={`${r.value[0]}:${r.value[1]}`}
                            >
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`${idPrefix}-width-${ti}-${oi}`}
                          className="text-xs text-muted-foreground"
                        >
                          Output Width (px)
                        </label>
                        <input
                          id={`${idPrefix}-width-${ti}-${oi}`}
                          type="number"
                          value={output.outputWidth}
                          onChange={(e) =>
                            updateOutput(ti, oi, {
                              outputWidth: Number(e.target.value),
                            })
                          }
                          aria-invalid={fieldErrors(ti, oi, "outputWidth").length > 0 || undefined}
                          aria-describedby={fieldErrors(ti, oi, "outputWidth").length > 0 ? `${idPrefix}-width-${ti}-${oi}-err` : undefined}
                          className={cn(
                            "w-full rounded-md border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm",
                            fieldErrors(ti, oi, "outputWidth").length > 0 ? "border-destructive" : "border-border"
                          )}
                        />
                        {fieldErrors(ti, oi, "outputWidth").map((e, i) => (
                          <p key={i} id={`${idPrefix}-width-${ti}-${oi}-err`} className="text-[11px] text-destructive mt-0.5">
                            {e.message}
                          </p>
                        ))}
                        <FieldHint>
                          Width of the exported file; height is calculated from
                          ratio
                        </FieldHint>
                      </div>
                      <div>
                        <label
                          htmlFor={`${idPrefix}-fmt-${ti}-${oi}`}
                          className="text-xs text-muted-foreground"
                        >
                          Format
                        </label>
                        <select
                          id={`${idPrefix}-fmt-${ti}-${oi}`}
                          value={output.outputFormat}
                          onChange={(e) => {
                            const fmt = e.target
                              .value as typeof output.outputFormat;
                            updateOutput(ti, oi, {
                              outputFormat: fmt,
                              // Reset quality to 100 for PNG (lossless)
                              ...(fmt === "png" ? { quality: 100 } : {}),
                            });
                          }}
                          className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm"
                        >
                          {FORMATS.map((f) => (
                            <option key={f} value={f}>
                              {f.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                      {output.outputFormat !== "png" ? (
                        <div>
                          <label
                            htmlFor={`${idPrefix}-quality-${ti}-${oi}`}
                            className="text-xs text-muted-foreground"
                          >
                            Quality ({output.quality}%)
                          </label>
                          <input
                            id={`${idPrefix}-quality-${ti}-${oi}`}
                            type="range"
                            min={10}
                            max={100}
                            step={5}
                            value={output.quality}
                            onChange={(e) =>
                              updateOutput(ti, oi, {
                                quality: Number(e.target.value),
                              })
                            }
                            className="w-full accent-primary"
                          />
                          <FieldHint>
                            Lower = smaller file, higher = better quality
                          </FieldHint>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Quality
                          </label>
                          <p className="text-sm text-muted-foreground/60 py-1">
                            PNG is always lossless
                          </p>
                        </div>
                      )}
                      <div>
                        <label
                          htmlFor={`${idPrefix}-fkey-${ti}-${oi}`}
                          className="text-xs text-muted-foreground"
                        >
                          Filename Key
                        </label>
                        <input
                          id={`${idPrefix}-fkey-${ti}-${oi}`}
                          type="text"
                          value={output.filenameKey}
                          placeholder="e.g. hero"
                          onChange={(e) =>
                            updateOutput(ti, oi, {
                              filenameKey: e.target.value,
                            })
                          }
                          aria-invalid={fieldErrors(ti, oi, "filenameKey").length > 0 || undefined}
                          aria-describedby={fieldErrors(ti, oi, "filenameKey").length > 0 ? `${idPrefix}-fkey-${ti}-${oi}-err` : undefined}
                          className={cn(
                            "w-full rounded-md border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm",
                            fieldErrors(ti, oi, "filenameKey").length > 0 ? "border-destructive" : "border-border"
                          )}
                        />
                        {fieldErrors(ti, oi, "filenameKey").map((e, i) => (
                          <p key={i} id={`${idPrefix}-fkey-${ti}-${oi}-err`} className="text-[11px] text-destructive mt-0.5">
                            {e.message}
                          </p>
                        ))}
                        <FieldHint>
                          Used in exported filename: photo__
                          {output.filenameKey || "key"}__{output.outputWidth}x
                          {output.outputHeight ??
                            Math.round(
                              (output.outputWidth * output.aspectRatio[1]) /
                                output.aspectRatio[0]
                            )}
                          .
                          {output.outputFormat === "jpeg"
                            ? "jpg"
                            : output.outputFormat}
                        </FieldHint>
                      </div>
                      <div>
                        <label
                          htmlFor={`${idPrefix}-hint-${ti}-${oi}`}
                          className="text-xs text-muted-foreground"
                        >
                          Crop Hint
                        </label>
                        <select
                          id={`${idPrefix}-hint-${ti}-${oi}`}
                          value={output.cropHint ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateOutput(ti, oi, {
                              cropHint:
                                v === "" ? null : (v as NonNullable<CropHint>),
                            });
                          }}
                          className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm"
                        >
                          {CROP_HINT_OPTIONS.map((opt) => (
                            <option key={opt.label} value={opt.value ?? ""}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <FieldHint>
                          Biases Suggest Crop — use Face options for portraits
                        </FieldHint>
                      </div>
                    </div>

                    {/* Additional formats — ship extra files sharing the
                        same crop / dimensions / quality. Common pattern:
                        WebP primary + JPEG fallback. */}
                    <fieldset className="mt-3 m-0 border-0 p-0">
                      <legend className="mb-1 text-xs text-muted-foreground">
                        Also Export As
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {FORMATS.filter((f) => f !== output.outputFormat).map(
                          (f) => {
                            const checked = (
                              output.additionalFormats ?? []
                            ).includes(f);
                            return (
                              <label
                                key={f}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-border bg-input px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const current =
                                      output.additionalFormats ?? [];
                                    const next = e.target.checked
                                      ? [...current, f]
                                      : current.filter((x) => x !== f);
                                    updateOutput(ti, oi, {
                                      additionalFormats:
                                        next.length > 0 ? next : undefined,
                                    });
                                  }}
                                  className="accent-blue focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-panel rounded-sm"
                                />
                                {f.toUpperCase()}
                              </label>
                            );
                          }
                        )}
                      </div>
                      <FieldHint>
                        Ship extra files with the same crop for fallback /
                        responsive use
                      </FieldHint>
                    </fieldset>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingIndex(null)}
              >
                Done
              </Button>
            </>
          ) : (
            // View mode
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-semibold text-foreground">
                    {template.name || "Untitled template"}
                  </h3>
                  {template.description && (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {template.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingIndex(ti)}
                    className="gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteConfirmIndex(ti)}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>

              {/* Output rows: aspect glyph + name + dims + format pill */}
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                {template.outputs.map((o) => {
                  const height =
                    o.outputHeight ??
                    Math.round(
                      (o.outputWidth * o.aspectRatio[1]) / o.aspectRatio[0]
                    );
                  return (
                    <div key={o.id} className="flex items-center gap-2.5">
                      <AspectGlyph aspectRatio={o.aspectRatio} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-foreground">
                          {o.name}
                        </div>
                        <div className="text-[11px] tabular-nums text-fg-tertiary">
                          {o.aspectRatio[0]}:{o.aspectRatio[1]} ·{" "}
                          {o.outputWidth} × {height} px
                        </div>
                      </div>
                      <FormatBadge format={o.outputFormat} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      {!apiAvailable && (
        <div
          className="rounded-lg border border-border bg-muted/30 p-3 text-sm"
          role="note"
        >
          <p className="font-medium mb-1">Static-only deployment</p>
          <p className="text-muted-foreground">
            No config API is available on this host, so edits can&apos;t be
            saved from the browser. Use <strong>Download JSON</strong> and
            upload the file to <code>/config.json</code> on your site.
          </p>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/5 p-3"
          role="alert"
        >
          <p className="text-[12px] font-medium text-destructive mb-1">
            Fix {validationErrors.length} issue{validationErrors.length === 1 ? "" : "s"} before saving:
          </p>
          <ul className="list-disc pl-4 text-[11px] text-destructive space-y-0.5">
            {validationErrors.map((e, i) => (
              <li key={i}>
                Template {e.templateIndex + 1}
                {e.outputIndex !== undefined && `, Output ${e.outputIndex + 1}`}
                : {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3 items-center flex-wrap">
        <Button type="button" variant="outline" onClick={addTemplate}>
          + Add Template
        </Button>
        {apiAvailable && (
          <Button type="button" onClick={handleSaveConfig} disabled={saving}>
            {saving ? "Saving…" : "Save Config"}
          </Button>
        )}
        <Button
          type="button"
          variant={apiAvailable ? "ghost" : "default"}
          onClick={handleDownloadConfig}
        >
          Download JSON
        </Button>
        {isDirty && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-medium text-warning"
            role="status"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-warning"
              aria-hidden="true"
            />
            Unsaved changes
          </span>
        )}
        <span role="status" aria-live="polite">
          {saveStatus === "saved" && (
            <span className="text-sm text-success">Saved!</span>
          )}
          {saveStatus === "error" && (
            <span className="text-sm text-destructive">{saveError}</span>
          )}
        </span>
      </div>

      {apiAvailable && (
        <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <p>
            Config is saved to the server. Use &quot;Download JSON&quot; to
            export a backup or for local development.
          </p>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirmIndex !== null}
        title="Delete template?"
        description={
          deleteConfirmIndex !== null
            ? `"${templates[deleteConfirmIndex]?.name || "Untitled Template"}" and all its outputs will be permanently removed. You'll need to save config to apply the change.`
            : ""
        }
        confirmLabel="Delete Template"
        onConfirm={() => {
          if (deleteConfirmIndex !== null) {
            removeTemplate(deleteConfirmIndex);
          }
          setDeleteConfirmIndex(null);
        }}
        onCancel={() => setDeleteConfirmIndex(null)}
      />
    </div>
  );
}
