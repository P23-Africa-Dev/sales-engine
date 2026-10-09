"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ModalShell } from "@/components/crm/crm-toolbar-modals";
import { downloadCsvFile, parseCsvContent, toCsvContent } from "@/lib/crm/csv";
import { parseProfileUrls } from "@/lib/crm/lead-fields";
import type {
    ApiLeadPriority,
    ApiRoleBasePath,
    CrmLabel,
    CrmPipeline,
    DuplicatePolicy,
    FailedImportRow,
    ImportLeadRow,
    ImportLeadsResult,
    ImportPreviewResult,
} from "@/lib/api/crm";
import { useCrmPreferences, useImportCrmLeads, usePreviewImportCrmLeads } from "@/hooks/use-crm";
import { resolveCrmPipelineId } from "@/lib/crm/resolve-pipeline";

const MAX_IMPORT_ROWS = 500;

type FieldKey = keyof ImportLeadRow;

const FIELD_OPTIONS: Array<{ value: FieldKey; label: string }> = [
    { value: "name", label: "Name (required)" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "location", label: "Location" },
    { value: "company_name", label: "Company Name" },
    { value: "website", label: "Website" },
    { value: "position", label: "Position" },
    { value: "profile_urls", label: "Profile URLs (comma-separated)" },
    { value: "source", label: "Source" },
    { value: "status", label: "Status" },
    { value: "priority", label: "Priority" },
    { value: "budget_amount", label: "Budget Amount" },
    { value: "budget_currency", label: "Budget Currency" },
];

const HEADER_ALIASES: Record<string, FieldKey> = {
    name: "name",
    full_name: "name",
    lead_name: "name",
    contact_name: "name",
    email: "email",
    email_address: "email",
    phone: "phone",
    phone_number: "phone",
    mobile: "phone",
    telephone: "phone",
    location: "location",
    address: "location",
    city: "location",
    company_name: "company_name",
    company: "company_name",
    organization: "company_name",
    organisation: "company_name",
    website: "website",
    web: "website",
    url: "website",
    position: "position",
    job_title: "position",
    title: "position",
    role: "position",
    profile_urls: "profile_urls",
    profile_url: "profile_urls",
    linkedin: "profile_urls",
    social_urls: "profile_urls",
    social_links: "profile_urls",
    source: "source",
    lead_source: "source",
    status: "status",
    label: "status",
    stage: "status",
    priority: "priority",
    budget_amount: "budget_amount",
    budget: "budget_amount",
    amount: "budget_amount",
    budget_currency: "budget_currency",
    currency: "budget_currency",
};

function autoMapHeader(header: string): FieldKey | "" {
    const normalized = header.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return HEADER_ALIASES[normalized] ?? "";
}

type Step = "upload" | "map" | "options" | "preview" | "results";

const STEP_LABELS: Array<{ key: Step; label: string }> = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map Columns" },
    { key: "options", label: "Options" },
    { key: "preview", label: "Preview" },
    { key: "results", label: "Results" },
];

export function ImportLeadsWizard({
    companyId,
    apiBasePath,
    pipelines,
    labels,
    onClose,
    onViewImportedPipeline,
    onViewAllLeads,
}: {
    companyId: number | string;
    apiBasePath: ApiRoleBasePath;
    pipelines: CrmPipeline[];
    defaultPipelineId?: number | null;
    labels: CrmLabel[];
    onClose: () => void;
    onViewImportedPipeline?: (pipelineId: number) => void;
    onViewAllLeads?: () => void;
}) {
    const [step, setStep] = useState<Step>("upload");
    const [fileName, setFileName] = useState<string>("");
    const [headers, setHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<Record<number, FieldKey | "">>({});
    const { data: preferences } = useCrmPreferences(companyId, apiBasePath);
    const resolvedPipelineId = resolveCrmPipelineId(
        pipelines,
        preferences?.preferred_pipeline_id,
        preferences?.company_default_pipeline_id,
    );
    const [pipelineIdOverride, setPipelineIdOverride] = useState<string>("");
    const pipelineId =
        pipelineIdOverride ||
        (resolvedPipelineId != null ? String(resolvedPipelineId) : "") ||
        (pipelines[0] ? String(pipelines[0].id) : "");
    const setPipelineId = setPipelineIdOverride;
    const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("skip");
    const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
    const [result, setResult] = useState<ImportLeadsResult | null>(null);
    const [failedRows, setFailedRows] = useState<FailedImportRow[]>([]);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const importMutation = useImportCrmLeads(apiBasePath);
    const previewMutation = usePreviewImportCrmLeads(apiBasePath);

    const downloadTemplate = () => {
        const exampleStatus = labels[0]?.name ?? "New Lead";
        const content = toCsvContent(
            [
                "name",
                "email",
                "phone",
                "location",
                "company_name",
                "website",
                "position",
                "profile_urls",
                "source",
                "status",
                "priority",
                "budget_amount",
                "budget_currency",
            ],
            [[
                "Jane Doe",
                "jane@example.com",
                "+1 555 000 1234",
                "Lagos",
                "Acme Ltd",
                "https://acme.com",
                "Head of Sales",
                "https://linkedin.com/in/jane,https://x.com/jane",
                "Referral",
                exampleStatus,
                "medium",
                "5000",
                "USD",
            ]]
        );
        downloadCsvFile("crm-leads-import-template.csv", content);
    };

    const processFile = useCallback(async (file: File) => {
        if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
            toast.error("Please upload a CSV file.");
            return;
        }

        const text = await file.text();
        const parsed = parseCsvContent(text);

        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
            setHeaders([]);
            setRawRows([]);
            toast.error("Your file has no data rows. Download our template and try again.");
            return;
        }

        setFileName(file.name);
        setHeaders(parsed.headers);
        setRawRows(parsed.rows);

        const autoMapping: Record<number, FieldKey | ""> = {};
        const used = new Set<FieldKey>();
        parsed.headers.forEach((header, idx) => {
            const field = autoMapHeader(header);
            if (field && !used.has(field)) {
                autoMapping[idx] = field;
                used.add(field);
            } else {
                autoMapping[idx] = "";
            }
        });
        setMapping(autoMapping);
    }, []);

    const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processFile(file);
    };

    const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (e.dataTransfer.items?.length) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        await processFile(file);
    }, [processFile]);

    const mappedRows = useMemo<ImportLeadRow[]>(() => {
        return rawRows.map((values) => {
            const row: ImportLeadRow = {};
            headers.forEach((_, idx) => {
                const field = mapping[idx];
                if (!field) return;
                const val = (values[idx] ?? "").trim();
                if (!val) return;
                if (field === "priority") {
                    row.priority = val.toLowerCase() as ApiLeadPriority;
                } else if (field === "budget_currency") {
                    row.budget_currency = val.toUpperCase();
                } else if (field === "profile_urls") {
                    const urls = parseProfileUrls(val);
                    if (urls.length > 0) {
                        row.profile_urls = urls;
                    }
                } else {
                    row[field] = val;
                }
            });
            return row;
        });
    }, [rawRows, headers, mapping]);

    const nameMapped = Object.values(mapping).includes("name");
    const tooManyRows = rawRows.length > MAX_IMPORT_ROWS;

    const runPreview = async () => {
        if (!pipelineId) {
            toast.error("Select a pipeline for import.");
            return;
        }
        try {
            const res = await previewMutation.mutateAsync({
                company_id: companyId,
                pipeline_id: Number(pipelineId),
                rows: mappedRows,
                duplicate_policy: duplicatePolicy,
            });
            setPreview(res.data);
            setStep("preview");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not validate the file.");
        }
    };

    const submitImport = async (targetRows: ImportLeadRow[]) => {
        if (!pipelineId) {
            toast.error("Select a pipeline for import.");
            return;
        }
        if (!targetRows.length) {
            toast.error("No rows to import.");
            return;
        }

        try {
            const res = await importMutation.mutateAsync({
                company_id: companyId,
                pipeline_id: Number(pipelineId),
                rows: targetRows,
                duplicate_policy: duplicatePolicy,
            });

            setResult(res.data);
            setFailedRows(res.data.failed_rows);
            setStep("results");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Import failed.");
        }
    };

    const downloadErrorReport = () => {
        if (!result) return;
        const reportHeaders = [
            "row", "name", "email", "phone", "location", "company_name", "website", "position", "profile_urls",
            "source", "status", "priority", "budget_amount", "budget_currency", "issue",
        ];
        const rows: Array<Array<string | number | null | undefined>> = [];

        for (const failed of result.failed_rows) {
            rows.push([
                failed.row_index,
                failed.data.name, failed.data.email, failed.data.phone, failed.data.location,
                failed.data.company_name, failed.data.website, failed.data.position,
                Array.isArray(failed.data.profile_urls) ? failed.data.profile_urls.join(", ") : failed.data.profile_urls,
                failed.data.source,
                failed.data.status, failed.data.priority, failed.data.budget_amount, failed.data.budget_currency,
                failed.errors.join(" | "),
            ]);
        }
        for (const skipped of result.skipped_rows) {
            rows.push([
                skipped.row_index,
                skipped.data.name, skipped.data.email, skipped.data.phone, skipped.data.location,
                skipped.data.company_name, skipped.data.website, skipped.data.position,
                Array.isArray(skipped.data.profile_urls) ? skipped.data.profile_urls.join(", ") : skipped.data.profile_urls,
                skipped.data.source,
                skipped.data.status, skipped.data.priority, skipped.data.budget_amount, skipped.data.budget_currency,
                skipped.reason,
            ]);
        }

        downloadCsvFile("crm-leads-import-errors.csv", toCsvContent(reportHeaders, rows));
    };

    const updateFailedRowField = (idx: number, field: FieldKey, value: string) => {
        setFailedRows((prev) =>
            prev.map((item, i) => (i === idx ? { ...item, data: { ...item.data, [field]: value } } : item))
        );
    };

    const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);

    return (
        <ModalShell title="Import Leads" onClose={onClose}>
            <div className="space-y-4">
                {/* Step indicator */}
                <div className="flex items-center gap-1">
                    {STEP_LABELS.map((s, idx) => (
                        <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${idx === stepIndex ? "bg-dash-dark text-white" : idx < stepIndex ? "text-emerald-600" : "text-gray-400"}`}>
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${idx === stepIndex ? "bg-white/20" : idx < stepIndex ? "bg-emerald-100" : "bg-gray-100"}`}>
                                    {idx < stepIndex ? "✓" : idx + 1}
                                </span>
                                {s.label}
                            </div>
                            {idx < STEP_LABELS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
                        </div>
                    ))}
                </div>

                {step === "upload" && (
                    <>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[13px] font-semibold text-dash-dark">1. Start from our template</p>
                                <p className="text-[12px] text-gray-500">Only <span className="font-semibold">name</span> is required. Add <span className="font-semibold">email</span> so we can detect duplicates.</p>
                            </div>
                            <button onClick={downloadTemplate} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 hover:border-gray-400">
                                <Download size={13} />
                                Download template
                            </button>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-[12px] text-gray-600 space-y-2">
                            <p><span className="font-semibold text-dash-dark">Required:</span> Name</p>
                            <p><span className="font-semibold text-dash-dark">Optional:</span> Email, Phone, Location, Company Name, Website, Position, Profile URLs, Source, Status, Priority, Budget Amount, Budget Currency</p>
                            <p><span className="font-semibold text-dash-dark">Profile URLs:</span> Put multiple URLs in one cell, separated by commas (e.g. <code className="text-[11px] bg-gray-50 px-1 rounded">https://linkedin.com/in/jane,https://x.com/jane</code>).</p>
                        </div>

                        <div
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors duration-200 ${
                                isDragging
                                    ? "border-dash-dark bg-dash-dark/5 ring-2 ring-dash-dark/10"
                                    : "border-gray-300 bg-gray-50"
                            }`}
                        >
                            <p className="text-[13px] font-semibold text-dash-dark mb-1">2. Upload your CSV file</p>
                            <p className="text-[12px] text-gray-500 mb-4">
                                {isDragging
                                    ? "Drop your CSV file here"
                                    : "Drag & drop your CSV here, or choose a file. Any column names are fine."}
                            </p>
                            <div className="flex flex-col items-center gap-2">
                                <input
                                    ref={fileRef}
                                    id="crm-import-csv-file"
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={onFileChange}
                                    className="sr-only"
                                />
                                {!isDragging && (
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 shadow-sm hover:border-gray-400 hover:bg-gray-100 transition-colors"
                                    >
                                        <Upload size={14} />
                                        {fileName ? "Choose another file" : "Choose CSV file"}
                                    </button>
                                )}
                                {isDragging && (
                                    <div className="flex flex-col items-center gap-1 py-2">
                                        <Upload size={24} className="text-dash-dark animate-bounce" />
                                    </div>
                                )}
                                {!fileName && !isDragging && (
                                    <p className="text-[11px] text-gray-400">No file chosen</p>
                                )}
                            </div>
                            {fileName && (
                                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[12px] text-gray-600">
                                    <FileText size={13} />
                                    {fileName} — {rawRows.length} row{rawRows.length === 1 ? "" : "s"}
                                </div>
                            )}
                            {tooManyRows && (
                                <p className="mt-2 text-[12px] text-red-500">
                                    Imports are limited to {MAX_IMPORT_ROWS} rows per file. Split the file and try again.
                                </p>
                            )}
                        </div>

                        <div className="text-[12px] text-gray-500 bg-white border border-gray-100 rounded-lg px-3 py-2">
                            Available statuses: {labels.map((label) => label.name).join(", ") || "New Lead"}
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setStep("map")}
                                disabled={rawRows.length === 0 || tooManyRows}
                                className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-40"
                            >
                                Continue
                            </button>
                        </div>
                    </>
                )}

                {step === "map" && (
                    <>
                        <p className="text-[12px] text-gray-500">
                            Match each column from your file to a lead field. Columns set to &quot;Don&apos;t import&quot; are ignored.
                        </p>

                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <table className="w-full text-[12px]">
                                <thead className="bg-gray-50">
                                    <tr className="text-left text-gray-400">
                                        <th className="px-3 py-2">Your column</th>
                                        <th className="px-3 py-2">First value</th>
                                        <th className="px-3 py-2 w-52">Imports as</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {headers.map((header, idx) => (
                                        <tr key={idx} className="border-t border-gray-100">
                                            <td className="px-3 py-2 font-semibold text-gray-600">{header || `Column ${idx + 1}`}</td>
                                            <td className="px-3 py-2 text-gray-400 truncate max-w-40">{rawRows[0]?.[idx] || "—"}</td>
                                            <td className="px-3 py-2">
                                                <select
                                                    value={mapping[idx] ?? ""}
                                                    onChange={(e) => setMapping((prev) => ({ ...prev, [idx]: e.target.value as FieldKey | "" }))}
                                                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] bg-white"
                                                >
                                                    <option value="">Don&apos;t import</option>
                                                    {FIELD_OPTIONS.map((option) => (
                                                        <option
                                                            key={option.value}
                                                            value={option.value}
                                                            disabled={Object.entries(mapping).some(([mappedIdx, mappedField]) => mappedField === option.value && Number(mappedIdx) !== idx)}
                                                        >
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {!nameMapped && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 flex items-center gap-2">
                                <AlertTriangle size={13} />
                                Map a column to <span className="font-semibold">Name</span> before continuing.
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <button onClick={() => setStep("upload")} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600">Back</button>
                            <button
                                onClick={() => setStep("options")}
                                disabled={!nameMapped}
                                className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-40"
                            >
                                Continue
                            </button>
                        </div>
                    </>
                )}

                {step === "options" && (
                    <>
                        <div>
                            <label className="block text-[12px] font-semibold text-gray-500 mb-1">Target Pipeline</label>
                            <SearchableSelect
                                value={pipelineId}
                                onChange={setPipelineId}
                                options={[{ value: "", label: "Select pipeline" }, ...pipelines.map((p) => ({ value: String(p.id), label: p.name }))]}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white"
                            />
                        </div>

                        <div>
                            <label className="block text-[12px] font-semibold text-gray-500 mb-2">If a lead already exists (same email or phone)</label>
                            <div className="space-y-2">
                                {([
                                    { value: "skip", title: "Skip duplicates", description: "Rows matching an existing lead are left untouched and reported." },
                                    { value: "update", title: "Update existing leads", description: "Matching leads are updated with the imported values. Blank cells never overwrite existing data." },
                                    { value: "create", title: "Create anyway", description: "Every row is imported as a new lead, even if it matches an existing one." },
                                ] as Array<{ value: DuplicatePolicy; title: string; description: string }>).map((option) => (
                                    <label
                                        key={option.value}
                                        className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${duplicatePolicy === option.value ? "border-dash-dark bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}
                                    >
                                        <input
                                            type="radio"
                                            name="duplicate_policy"
                                            value={option.value}
                                            checked={duplicatePolicy === option.value}
                                            onChange={() => setDuplicatePolicy(option.value)}
                                            className="mt-0.5"
                                        />
                                        <span>
                                            <span className="block text-[13px] font-semibold text-dash-dark">{option.title}</span>
                                            <span className="block text-[12px] text-gray-500">{option.description}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <button onClick={() => setStep("map")} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600">Back</button>
                            <button
                                onClick={runPreview}
                                disabled={previewMutation.isPending || !pipelineId}
                                className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-40"
                            >
                                {previewMutation.isPending ? "Validating…" : "Validate & Preview"}
                            </button>
                        </div>
                    </>
                )}

                {step === "preview" && preview && (
                    <>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                                <p className="text-[20px] font-bold text-emerald-600">{preview.valid_count}</p>
                                <p className="text-[11px] font-semibold text-emerald-700">Ready to import</p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                                <p className="text-[20px] font-bold text-amber-600">{preview.duplicate_count}</p>
                                <p className="text-[11px] font-semibold text-amber-700">
                                    Duplicates ({duplicatePolicy === "skip" ? "will skip" : duplicatePolicy === "update" ? "will update" : "will create"})
                                </p>
                            </div>
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                                <p className="text-[20px] font-bold text-red-500">{preview.error_rows.length}</p>
                                <p className="text-[11px] font-semibold text-red-600">Errors (will be reported)</p>
                            </div>
                        </div>

                        {preview.error_rows.length > 0 && (
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <div className="px-3 py-2 bg-gray-50 text-[12px] font-semibold text-gray-500">Rows with errors (first 10)</div>
                                <div className="max-h-48 overflow-auto">
                                    <table className="w-full text-[12px]">
                                        <tbody>
                                            {preview.error_rows.slice(0, 10).map((row) => (
                                                <tr key={row.row_index} className="border-t border-gray-100">
                                                    <td className="px-3 py-2 font-semibold text-gray-500 w-16">Row {row.row_index}</td>
                                                    <td className="px-3 py-2">{row.data.name || "—"}</td>
                                                    <td className="px-3 py-2 text-red-500">{row.errors.join(" ")}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <div className="px-3 py-2 bg-gray-50 text-[12px] font-semibold text-gray-500">Data preview (first 10 of {preview.total_rows})</div>
                            <div className="max-h-48 overflow-auto">
                                <table className="w-full text-[12px]">
                                    <thead className="bg-white sticky top-0">
                                        <tr className="text-left text-gray-400">
                                            <th className="px-3 py-2">Name</th>
                                            <th className="px-3 py-2">Email</th>
                                            <th className="px-3 py-2">Phone</th>
                                            <th className="px-3 py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mappedRows.slice(0, 10).map((row, idx) => (
                                            <tr key={idx} className="border-t border-gray-100">
                                                <td className="px-3 py-2">{row.name || "—"}</td>
                                                <td className="px-3 py-2">{row.email || "—"}</td>
                                                <td className="px-3 py-2">{row.phone || "—"}</td>
                                                <td className="px-3 py-2">{row.status || labels[0]?.name || "New Lead"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <button onClick={() => setStep("options")} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600">Back</button>
                            <button
                                onClick={() => submitImport(mappedRows)}
                                disabled={importMutation.isPending}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-40"
                            >
                                <Upload size={13} />
                                {importMutation.isPending ? "Importing…" : `Import ${preview.total_rows - preview.error_rows.length} lead(s)`}
                            </button>
                        </div>
                    </>
                )}

                {step === "results" && result && (
                    <>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
                            <CheckCircle2 size={20} className={result.failed_rows.length > 0 ? "text-amber-500" : "text-emerald-500"} />
                            <p className="text-[13px] text-gray-700">
                                <span className="font-semibold">{result.imported_count}</span> imported,{" "}
                                <span className="font-semibold">{result.updated_count}</span> updated,{" "}
                                <span className="font-semibold">{result.skipped_count}</span> skipped,{" "}
                                <span className="font-semibold">{result.failed_rows.length}</span> failed.
                            </p>
                        </div>
                        <p className="text-[12px] text-gray-500">
                            Imported leads are available immediately. Pipeline columns load progressively for large datasets.
                        </p>

                        {(result.failed_rows.length > 0 || result.skipped_rows.length > 0) && (
                            <div className="flex justify-end">
                                <button onClick={downloadErrorReport} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 hover:border-gray-400">
                                    <Download size={13} />
                                    Download error report
                                </button>
                            </div>
                        )}

                        {failedRows.length > 0 && (
                            <>
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 flex items-start gap-2">
                                    <AlertTriangle size={14} className="mt-0.5" />
                                    Fix the failed rows below and retry — already-imported rows will not be duplicated.
                                </div>

                                <div className="space-y-3 max-h-[40vh] overflow-auto pr-1">
                                    {failedRows.map((row, idx) => (
                                        <div key={`${row.row_index}-${idx}`} className="border border-gray-200 rounded-xl p-3">
                                            <p className="text-[12px] font-semibold text-gray-500 mb-2">Row {row.row_index}</p>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                                                {FIELD_OPTIONS.map((field) => (
                                                    <input
                                                        key={field.value}
                                                        value={String(row.data[field.value] ?? "")}
                                                        onChange={(e) => updateFailedRowField(idx, field.value, e.target.value)}
                                                        placeholder={field.label.replace(" (required)", "")}
                                                        className="border border-gray-200 rounded-lg px-3 py-2 text-[12px]"
                                                    />
                                                ))}
                                            </div>
                                            <ul className="text-[11px] text-red-500 list-disc pl-4">
                                                {row.errors.map((err, i) => <li key={i}>{err}</li>)}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="flex items-center justify-end gap-2">
                            {failedRows.length > 0 && (
                                <button
                                    onClick={() => submitImport(failedRows.map((row) => row.data))}
                                    disabled={importMutation.isPending}
                                    className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-40"
                                >
                                    {importMutation.isPending ? "Retrying…" : "Retry failed rows"}
                                </button>
                            )}
                            <button
                                onClick={() => onViewAllLeads?.()}
                                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-[12px] font-semibold"
                            >
                                View all leads
                            </button>
                            <button
                                onClick={() => onViewImportedPipeline?.(Number(pipelineId))}
                                className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold"
                            >
                                View imported pipeline
                            </button>
                        </div>
                    </>
                )}
            </div>
        </ModalShell>
    );
}
