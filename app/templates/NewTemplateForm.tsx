"use client";

import { useState } from "react";
import { InfoTip } from "./InfoTip";

type Button =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phoneNumber: string };

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

function placeholderCount(text: string) {
  let max = 0;
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

export function NewTemplateForm({
  onCreated,
  onError
}: {
  onCreated: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("ar");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<Button[]>([]);
  const [examples, setExamples] = useState<string[]>([]);

  const params = placeholderCount(bodyText);
  const headerHasEmoji = EMOJI.test(headerText);
  const nameLooksWrong = name.length > 0 && !/^[a-z0-9_]+$/.test(name);

  function setExample(index: number, value: string) {
    const next = [...examples];
    next[index] = value;
    setExamples(next);
  }

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/templates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          language,
          category,
          headerText,
          bodyText,
          footerText,
          buttons,
          bodyExamples: Array.from({ length: params }, (_, index) => examples[index] || "سارة")
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Meta refused the template.");
      }

      setOpen(false);
      setName("");
      setHeaderText("");
      setBodyText("");
      setFooterText("");
      setButtons([]);
      setExamples([]);
      await onCreated(
        payload.template?.dryRun
          ? "Submitted in simulation — nothing reached Meta from this environment."
          : `Sent to Meta. It is ${payload.template?.status ?? "PENDING"} — the list here shows when that changes.`
      );
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not submit the template.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="newPath">
        <button onClick={() => setOpen(true)} type="button">
          New template
        </button>
        <span className="hint">
          Written here, reviewed by Meta, and usable in a path once approved — usually within minutes.
        </span>
      </div>
    );
  }

  return (
    <section className="templateForm">
      <header>
        <h2>New template</h2>
        <button className="secondary" onClick={() => setOpen(false)} type="button">
          Cancel
        </button>
      </header>

      <div className="stepForm">
        <label>
          <span>
            Name
            <InfoTip title="Name">
              Meta&apos;s own rule: lower-case letters, digits and underscores — no spaces and no Arabic. It is never
              shown to anyone; it is how the template is addressed when sending. Choose it carefully: if Meta rejects
              the template over its category, <strong>that name is burned</strong> — a category cannot be changed
              afterwards, so a second attempt needs a new name.
            </InfoTip>
          </span>
          <input
            onChange={(event) => setName(event.target.value.toLowerCase().replace(/\s+/g, "_"))}
            placeholder="clean_week1_morning_util"
            value={name}
          />
          {nameLooksWrong ? <span className="hint warnText">Only a-z, 0-9 and _ are allowed.</span> : null}
        </label>

        <label>
          <span>
            Language
            <InfoTip title="Language">
              The language Meta files it under. A template is one language only — the same words in Hebrew are a
              separate template. Afkar&apos;s are all <code>ar</code>.
            </InfoTip>
          </span>
          <select onChange={(event) => setLanguage(event.target.value)} value={language}>
            <option value="ar">Arabic (ar)</option>
            <option value="he">Hebrew (he)</option>
            <option value="en">English (en)</option>
          </select>
        </label>

        <label>
          <span>
            Category
            <InfoTip title="Category">
              <strong>Utility</strong> follows up on something the member is already in — a reminder, an update, a
              next step. It reaches everyone. <strong>Marketing</strong> offers or sells; it counts against each
              person&apos;s marketing cap and Meta withholds some of it. Six of Afkar&apos;s templates are named
              <code>_util</code> while Meta files them as MARKETING — and that alone caused most of the 267 failed
              sends. The category is decided by what the text does, not by the name.
            </InfoTip>
          </span>
          <select onChange={(event) => setCategory(event.target.value as "UTILITY" | "MARKETING")} value={category}>
            <option value="UTILITY">Utility — follow-up, reminder, update</option>
            <option value="MARKETING">Marketing — an offer or an invitation</option>
          </select>
        </label>

        <label className="full">
          <span>
            Header — one line above the message (optional)
            <InfoTip title="Header">
              A single short line, shown in bold above the text. <strong>It takes no emoji</strong> — Meta rejects the
              template without explaining why. Leave it empty unless the message really needs a title.
            </InfoTip>
          </span>
          <input
            onChange={(event) => setHeaderText(event.target.value)}
            placeholder="أسبوع Clean"
            value={headerText}
          />
          {headerHasEmoji ? (
            <span className="hint warnText">
              That emoji will get the template rejected. Move it into the body, where emoji are welcome.
            </span>
          ) : null}
        </label>

        <label className="full">
          <span>
            Message
            <InfoTip title="Message">
              The words the member reads. Write <code>{"{{1}}"}</code> where their name belongs, and Afkar&apos;s
              system fills it in. Emoji are fine here. One thing to avoid entirely: explaining a login or
              verification code — Meta reads that as an authentication template, which takes no free text, and
              rejects it in every category.
            </InfoTip>
          </span>
          <textarea
            onChange={(event) => setBodyText(event.target.value)}
            placeholder="سلام {{1}} 👋 اليوم بلشنا أسبوع Clean، وأنا معك خطوة بخطوة"
            rows={5}
            value={bodyText}
          />
          <span className="hint">
            {params ? `${params} variable(s) — {{1}}…{{${params}}}` : "No variables — every member reads the same words."}
          </span>
        </label>

        {params ? (
          <div className="full">
            <span className="fieldLabel">
              An example for each variable
              <InfoTip title="Examples">
                Meta will not review a template without a sample value for every <code>{"{{n}}"}</code>. It is only
                shown to the reviewer — members always see the real value.
              </InfoTip>
            </span>
            <div className="exampleRow">
              {Array.from({ length: params }, (_, index) => (
                <input
                  key={index}
                  onChange={(event) => setExample(index, event.target.value)}
                  placeholder={index === 0 ? "سارة" : `{{${index + 1}}}`}
                  value={examples[index] ?? ""}
                />
              ))}
            </div>
          </div>
        ) : null}

        <label className="full">
          <span>
            Footer — small print under the message (optional)
            <InfoTip title="Footer">
              A short grey line under the text, the same for everyone. It takes no variables. Useful for something
              like «للإلغاء ردّي stop».
            </InfoTip>
          </span>
          <input
            onChange={(event) => setFooterText(event.target.value)}
            placeholder="أفكار — Eat.Love.Fit"
            value={footerText}
          />
        </label>

        <div className="full">
          <span className="fieldLabel">
            Buttons (optional)
            <InfoTip title="Buttons">
              <strong>Quick reply</strong> sends its own text back as the member&apos;s answer — and a reply opens the
              24-hour window, which is when a path can speak freely. <strong>Link</strong> opens a web page. Up to
              three buttons; every one of them is another thing the reviewer can refuse, so add only what earns its
              place.
            </InfoTip>
          </span>

          {buttons.map((button, index) => (
            <div className="buttonRow" key={index}>
              <select
                onChange={(event) => {
                  const type = event.target.value as Button["type"];
                  const next = [...buttons];
                  next[index] =
                    type === "URL"
                      ? { type, text: button.text, url: "" }
                      : type === "PHONE_NUMBER"
                        ? { type, text: button.text, phoneNumber: "" }
                        : { type, text: button.text };
                  setButtons(next);
                }}
                value={button.type}
              >
                <option value="QUICK_REPLY">Quick reply</option>
                <option value="URL">Link</option>
                <option value="PHONE_NUMBER">Call</option>
              </select>
              <input
                onChange={(event) => {
                  const next = [...buttons];
                  next[index] = { ...button, text: event.target.value };
                  setButtons(next);
                }}
                placeholder="بدي العرض"
                value={button.text}
              />
              {button.type === "URL" ? (
                <input
                  onChange={(event) => {
                    const next = [...buttons];
                    next[index] = { ...button, url: event.target.value } as Button;
                    setButtons(next);
                  }}
                  placeholder="https://…"
                  value={button.url}
                />
              ) : null}
              {button.type === "PHONE_NUMBER" ? (
                <input
                  onChange={(event) => {
                    const next = [...buttons];
                    next[index] = { ...button, phoneNumber: event.target.value } as Button;
                    setButtons(next);
                  }}
                  placeholder="+972…"
                  value={button.phoneNumber}
                />
              ) : null}
              <button
                className="secondary"
                onClick={() => setButtons(buttons.filter((_, at) => at !== index))}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}

          {buttons.length < 3 ? (
            <button
              className="secondary"
              onClick={() => setButtons([...buttons, { type: "QUICK_REPLY", text: "" }])}
              type="button"
            >
              Add a button
            </button>
          ) : null}
        </div>

        <div className="full stepFormActions">
          <button disabled={busy || !name || !bodyText.trim() || nameLooksWrong} onClick={() => void submit()} type="button">
            {busy ? "Sending to Meta…" : "Send for review"}
          </button>
          <span className="hint">
            Meta answers in this same request: <strong>PENDING</strong> means it went to review, and anything else
            means it was refused on the spot for what it says.
          </span>
        </div>
      </div>
    </section>
  );
}
