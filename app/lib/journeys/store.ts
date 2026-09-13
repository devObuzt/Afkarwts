import { getDb } from "../db";

export type JourneyTemplate = {
  id: number;
  name: string;
  smsText: string;
  createdAt: string;
  archivedAt: string | null;
};

export type JourneyStep = {
  id: number;
  templateId: number;
  week: number;
  weekday: number;
  sendTime: string;
  label: string;
  freeText: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  templatePreview: string;
  createdAt: string;
  archivedAt: string | null;
};

export type Journey = {
  id: number;
  templateId: number;
  groupId: number;
  anchorDate: string;
  status: "draft" | "active" | "paused" | "done";
  createdAt: string;
  activatedAt: string | null;
};

type DbTemplate = {
  id: number;
  name: string;
  sms_text: string;
  created_at: string;
  archived_at: string | null;
};

type DbStep = {
  id: number;
  template_id: number;
  week: number;
  weekday: number;
  send_time: string;
  label: string;
  free_text: string;
  template_name: string;
  template_language: string;
  body_params: string;
  template_preview: string;
  created_at: string;
  archived_at: string | null;
};

type DbJourney = {
  id: number;
  template_id: number;
  group_id: number;
  anchor_date: string;
  status: Journey["status"];
  created_at: string;
  activated_at: string | null;
};

function mapTemplate(row: DbTemplate): JourneyTemplate {
  return {
    id: row.id,
    name: row.name,
    smsText: row.sms_text,
    createdAt: row.created_at,
    archivedAt: row.archived_at
  };
}

function mapStep(row: DbStep): JourneyStep {
  return {
    id: row.id,
    templateId: row.template_id,
    week: row.week,
    weekday: row.weekday,
    sendTime: row.send_time,
    label: row.label,
    freeText: row.free_text,
    templateName: row.template_name,
    templateLanguage: row.template_language,
    bodyParams: JSON.parse(row.body_params || "[]") as string[],
    templatePreview: row.template_preview,
    createdAt: row.created_at,
    archivedAt: row.archived_at
  };
}

function mapJourney(row: DbJourney): Journey {
  return {
    id: row.id,
    templateId: row.template_id,
    groupId: row.group_id,
    anchorDate: row.anchor_date,
    status: row.status,
    createdAt: row.created_at,
    activatedAt: row.activated_at
  };
}

/* Templates */

export function createTemplate(input: { name: string; smsText?: string }) {
  const result = getDb()
    .prepare("INSERT INTO journey_templates (name, sms_text) VALUES (?, ?)")
    .run(input.name.trim(), input.smsText ?? "");
  return getTemplate(Number(result.lastInsertRowid))!;
}

export function getTemplate(id: number) {
  const row = getDb().prepare("SELECT * FROM journey_templates WHERE id = ?").get(id) as DbTemplate | undefined;
  return row ? mapTemplate(row) : null;
}

export function listTemplates() {
  const rows = getDb()
    .prepare("SELECT * FROM journey_templates WHERE archived_at IS NULL ORDER BY created_at DESC")
    .all() as DbTemplate[];
  return rows.map(mapTemplate);
}

export function updateTemplate(id: number, input: { name?: string; smsText?: string }) {
  const current = getTemplate(id);
  if (!current) {
    throw new Error("Template not found.");
  }

  getDb()
    .prepare("UPDATE journey_templates SET name = ?, sms_text = ? WHERE id = ?")
    .run(input.name?.trim() ?? current.name, input.smsText ?? current.smsText, id);
  return getTemplate(id)!;
}

export function archiveTemplate(id: number) {
  getDb().prepare("UPDATE journey_templates SET archived_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}

/* Steps */

export function createStep(input: {
  templateId: number;
  week: number;
  weekday: number;
  sendTime: string;
  label?: string;
  freeText?: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  templatePreview: string;
}) {
  const result = getDb()
    .prepare(
      `INSERT INTO journey_steps
         (template_id, week, weekday, send_time, label, free_text, template_name, template_language, body_params, template_preview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.templateId,
      input.week,
      input.weekday,
      input.sendTime,
      input.label ?? "",
      input.freeText ?? "",
      input.templateName,
      input.templateLanguage,
      JSON.stringify(input.bodyParams),
      input.templatePreview
    );
  return getStep(Number(result.lastInsertRowid))!;
}

export function getStep(id: number) {
  const row = getDb().prepare("SELECT * FROM journey_steps WHERE id = ?").get(id) as DbStep | undefined;
  return row ? mapStep(row) : null;
}

/** Schedule order, archived steps excluded. */
export function listSteps(templateId: number) {
  const rows = getDb()
    .prepare(
      `SELECT * FROM journey_steps
       WHERE template_id = ? AND archived_at IS NULL
       ORDER BY week ASC, weekday ASC, send_time ASC, id ASC`
    )
    .all(templateId) as DbStep[];
  return rows.map(mapStep);
}

export function updateStep(
  id: number,
  input: Partial<Omit<JourneyStep, "id" | "templateId" | "createdAt" | "archivedAt">>
) {
  const current = getStep(id);
  if (!current) {
    throw new Error("Step not found.");
  }

  const next = { ...current, ...input };
  getDb()
    .prepare(
      `UPDATE journey_steps
       SET week = ?, weekday = ?, send_time = ?, label = ?, free_text = ?,
           template_name = ?, template_language = ?, body_params = ?, template_preview = ?
       WHERE id = ?`
    )
    .run(
      next.week,
      next.weekday,
      next.sendTime,
      next.label,
      next.freeText,
      next.templateName,
      next.templateLanguage,
      JSON.stringify(next.bodyParams),
      next.templatePreview,
      id
    );
  return getStep(id)!;
}

/** Steps are archived, never deleted, so a sent message keeps its step. */
export function archiveStep(id: number) {
  getDb().prepare("UPDATE journey_steps SET archived_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}

/* Journeys */

export function createJourney(input: { templateId: number; groupId: number; anchorDate: string }) {
  const result = getDb()
    .prepare("INSERT INTO journeys (template_id, group_id, anchor_date) VALUES (?, ?, ?)")
    .run(input.templateId, input.groupId, input.anchorDate);
  return getJourney(Number(result.lastInsertRowid))!;
}

export function getJourney(id: number) {
  const row = getDb().prepare("SELECT * FROM journeys WHERE id = ?").get(id) as DbJourney | undefined;
  return row ? mapJourney(row) : null;
}

export function listJourneys() {
  const rows = getDb().prepare("SELECT * FROM journeys ORDER BY created_at DESC").all() as DbJourney[];
  return rows.map(mapJourney);
}

export function listActiveJourneys() {
  const rows = getDb()
    .prepare("SELECT * FROM journeys WHERE status = 'active' ORDER BY id ASC")
    .all() as DbJourney[];
  return rows.map(mapJourney);
}

export function setJourneyStatus(id: number, status: Journey["status"]) {
  const activating = status === "active";
  getDb()
    .prepare(
      `UPDATE journeys
       SET status = ?, activated_at = CASE WHEN ? = 1 AND activated_at IS NULL THEN CURRENT_TIMESTAMP ELSE activated_at END
       WHERE id = ?`
    )
    .run(status, activating ? 1 : 0, id);
}
