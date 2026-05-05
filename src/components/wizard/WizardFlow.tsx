import { useState, useId } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/hooks/useConfig";
import type { CropHint, Template, TemplateOutput, AppConfig } from "@/types";
import { defaultConfig } from "@/config/default-config";
import { downloadBlob } from "@/utils/download";
import { generateId } from "@/utils/id";
import {
  validateTemplateConfig,
  type TemplateConfigError,
} from "@/utils/validation";
import { AspectGlyph } from "@/components/ui/aspect-glyph";
import { FormatBadge } from "@/components/ui/format-badge";

const PRESET_RATIOS = [
  { label: "16:9 (Widescreen)", value: [16, 9] as [number, number] },
  { label: "4:3 (Standard)", value: [4, 3] as [number, number] },
  { label: "3:2 (Photo)", value: [3, 2] as [number, number] },
  { label: "1:1 (Square)", value: [1, 1] as [number, number] },
  { label: "2:3 (Portrait)", value: [2, 3] as [number, number] },
  { label: "9:16 (Vertical)", value: [9, 16] as [number, number] },
];

const FORMATS = ["webp", "jpeg", "png", "avif"] as const;

/**
 * Crop hint presets: bias the Suggest Crop algorithm toward likely subject
 * placement. `null` = no bias (pure saliency). Keep in sync with the same
 * list in admin/TemplateEditor.tsx.
 */
const CROP_HINT_OPTIONS: Array<{ value: CropHint; label: string }> = [
  { value: null, label: "None" },
  { value: "face-center", label: "Face — center" },
  { value: "face-top", label: "Face — top" },
  { value: "center", label: "Center" },
];

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

function createEmptyTemplate(): Template {
  return {
    id: `template-${generateId()}`,
    name: "",
    description: "",
    minInputWidth: null,
    minInputShortSide: null,
    outputs: [createEmptyOutput(0)],
  };
}

const STEPS = [
  { key: "intro", label: "Start" },
  { key: "templates", label: "Configure" },
  { key: "review", label: "Review" },
] as const;

function StepIndicator({ current }: { current: string }) {
  return (
    <nav aria-label="Wizard progress" className="mb-6 flex items-center gap-2">
      {STEPS.map((s, i) => {
        const isCurrent = s.key === current;
        const isPast = STEPS.findIndex((x) => x.key === current) > i;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 ${isPast ? "bg-blue" : "bg-border"}`}
                aria-hidden="true"
              />
            )}
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isCurrent
                    ? "bg-blue text-white"
                    : isPast
                      ? "bg-blue/20 text-blue"
                      : "bg-raised text-fg-tertiary"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`text-[12px] font-medium ${
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export default function WizardFlow() {
  const navigate = useNavigate();
  const { saveConfig: persistConfig, saving, apiAvailable } = useConfig();
  const [step, setStep] = useState<"intro" | "templates" | "review">("intro");
  const [templates, setTemplates] = useState<Template[]>([]);
  // useDefaults state was removed — the Edit button on review step is
  // now always visible so users can customize from the default baseline.
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle"
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    TemplateConfigError[]
  >([]);

  // Stable ID prefix for label association
  const idPrefix = useId();

  const handleUseDefaults = () => {
    setTemplates([...defaultConfig.templates]);
    setStep("review");
  };

  const handleStartCustom = () => {
    setTemplates([createEmptyTemplate()]);
    setStep("templates");
  };

  const addTemplate = () => {
    setTemplates((prev) => [...prev, createEmptyTemplate()]);
  };

  const removeTemplate = (index: number) => {
    setTemplates((prev) => prev.filter((_, i) => i !== index));
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
    filenamePattern: "{basename}__{filenameKey}__{width}x{height}.{ext}",
  });

  const handleSaveConfig = async () => {
    setSaveError(null);
    try {
      await persistConfig(buildConfig());
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleSaveAndFinish = async () => {
    setSaveError(null);
    try {
      await persistConfig(buildConfig());
      navigate("/");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDownloadConfig = () => {
    const json = JSON.stringify(buildConfig(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, "config.json");
  };

  if (step === "intro") {
    return (
      <div className="space-y-6">
        <StepIndicator current="intro" />
        <div>
          <h2 className="text-xl font-semibold mb-2">Welcome!</h2>
          <p className="text-muted-foreground">
            This tool helps you crop and resize images to match your Webflow
            components. Templates define the aspect ratios, dimensions, and
            export settings for each component type.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleUseDefaults}>Use Default Templates</Button>
          <Button variant="outline" onClick={handleStartCustom}>
            Create Custom Templates
          </Button>
        </div>
      </div>
    );
  }

  if (step === "templates") {
    return (
      <div className="space-y-6">
        <StepIndicator current="templates" />
        <h2 className="text-xl font-semibold">Configure templates</h2>

        {templates.map((template, ti) => (
          <div
            key={template.id}
            className="rounded-lg border border-border p-4 space-y-4"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-medium">Template {ti + 1}</h3>
              {templates.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTemplate(ti)}
                  className="rounded-[4px] px-2 py-1 text-xs text-destructive hover:bg-raised focus-visible:ring-2 focus-visible:ring-blue"
                >
                  Remove
                </button>
              )}
            </div>

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
                  onChange={(e) => updateTemplate(ti, { name: e.target.value })}
                  placeholder="e.g., Blog Hero"
                  className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-3 py-1.5 text-sm"
                />
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
                  placeholder="Short description"
                  className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor={`${idPrefix}-minw-${ti}`}
                  className="text-xs text-muted-foreground"
                >
                  Min Input Width (px)
                </label>
                <input
                  id={`${idPrefix}-minw-${ti}`}
                  type="number"
                  value={template.minInputWidth ?? ""}
                  onChange={(e) =>
                    updateTemplate(ti, {
                      minInputWidth: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="Optional"
                  className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor={`${idPrefix}-mins-${ti}`}
                  className="text-xs text-muted-foreground"
                >
                  Min Short Side (px)
                </label>
                <input
                  id={`${idPrefix}-mins-${ti}`}
                  type="number"
                  value={template.minInputShortSide ?? ""}
                  onChange={(e) =>
                    updateTemplate(ti, {
                      minInputShortSide: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="Optional"
                  className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* Outputs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                    <span className="text-xs font-medium">Output {oi + 1}</span>
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
                        Name
                      </label>
                      <input
                        id={`${idPrefix}-oname-${ti}-${oi}`}
                        type="text"
                        value={output.name}
                        onChange={(e) =>
                          updateOutput(ti, oi, { name: e.target.value })
                        }
                        placeholder="Output name"
                        className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm"
                      />
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
                        Width (px)
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
                        className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm"
                      />
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
                        onChange={(e) =>
                          updateOutput(ti, oi, {
                            outputFormat: e.target
                              .value as typeof output.outputFormat,
                          })
                        }
                        className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm"
                      >
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor={`${idPrefix}-quality-${ti}-${oi}`}
                        className="text-xs text-muted-foreground"
                      >
                        Quality ({output.quality})
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
                    </div>
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
                        onChange={(e) =>
                          updateOutput(ti, oi, {
                            filenameKey: e.target.value,
                          })
                        }
                        placeholder="e.g., blog-hero"
                        className="w-full rounded-md border border-border bg-input text-foreground outline-none focus:border-blue px-2 py-1 text-sm"
                      />
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
                    </div>
                  </div>

                  {/* Also export as — extra formats sharing this crop */}
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Also Export As
                    </label>
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addTemplate}>
          + Add Template
        </Button>

        {validationErrors.length > 0 && (
          <div
            className="rounded-lg border border-destructive/50 bg-destructive/5 p-3"
            role="alert"
          >
            <p className="text-[12px] font-medium text-destructive mb-1">
              Fix {validationErrors.length} issue{validationErrors.length === 1 ? "" : "s"} before continuing:
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

        <div className="flex gap-3 pt-4">
          <Button
            onClick={() => {
              const errors = validateTemplateConfig(templates);
              setValidationErrors(errors);
              if (errors.length === 0) setStep("review");
            }}
          >
            Review
          </Button>
          <Button variant="ghost" onClick={() => setStep("intro")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  // Review step
  return (
    <div className="space-y-6">
      <StepIndicator current="review" />
      <h2 className="text-xl font-semibold">Review configuration</h2>

      {templates.map((template) => (
        <div
          key={template.id}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <div>
            <h3 className="text-[14px] font-semibold">
              {template.name || "Untitled"}
            </h3>
            {template.description && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {template.description}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            {template.outputs.map((output) => {
              const height =
                output.outputHeight ??
                Math.round(
                  (output.outputWidth * output.aspectRatio[1]) /
                    output.aspectRatio[0]
                );
              return (
                <div key={output.id} className="flex items-center gap-2.5">
                  <AspectGlyph aspectRatio={output.aspectRatio} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-foreground">
                      {output.name}
                    </div>
                    <div className="text-[11px] tabular-nums text-fg-tertiary">
                      {output.aspectRatio[0]}:{output.aspectRatio[1]} ·{" "}
                      {output.outputWidth} × {height} px · Q{output.quality}
                    </div>
                  </div>
                  <FormatBadge format={output.outputFormat} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!apiAvailable && (
        <div
          className="rounded-lg border border-border bg-muted/30 p-3 text-sm"
          role="note"
        >
          <p className="font-medium mb-1">Static-only deployment detected</p>
          <p className="text-muted-foreground">
            This site isn&apos;t served with the optional config API, so
            templates can&apos;t be saved from the browser. Use{" "}
            <strong>Download JSON</strong> and upload the file to your
            site&apos;s <code>/config.json</code> to make these templates live.
          </p>
        </div>
      )}

      <div className="flex gap-3 items-center pt-4 border-t border-border flex-wrap">
        {apiAvailable ? (
          <>
            <Button onClick={handleSaveAndFinish} disabled={saving}>
              {saving ? "Saving…" : "Save & Go to Cropper"}
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveConfig}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Config"}
            </Button>
          </>
        ) : (
          <Button onClick={() => navigate("/")}>Go to Cropper</Button>
        )}
        <Button
          variant={apiAvailable ? "ghost" : "outline"}
          onClick={handleDownloadConfig}
        >
          Download JSON
        </Button>
        <Button variant="ghost" onClick={() => setStep("templates")}>
          Edit
        </Button>
      </div>

      <span role="status" aria-live="polite">
        {saveStatus === "saved" && (
          <p className="text-sm text-success">Config saved!</p>
        )}
        {saveStatus === "error" && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}
      </span>
    </div>
  );
}
