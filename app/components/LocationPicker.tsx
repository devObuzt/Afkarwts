"use client";
/**
 * Choosing a country, and then a town.
 *
 * A sheet with a search box rather than a list of options: Israel alone has
 * 1,138 localities, and any control that shows them all at once is unusable
 * on a phone. Search covers Arabic, Hebrew and English at the same time,
 * because people type a town in whatever script is on their keyboard.
 *
 * Ported from LegaliSync, where every awkward bit below was paid for once
 * already. The register is Manzuma's, read through our own /api/locations.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const LOCATIONS = "/api/locations";

/**
 * What the reader actually typed, with the marks their keyboard added.
 *
 * Measured on an iPhone: with the Arabic-transliteration keyboard the box
 * read `kab` and the register answered with nothing, because what was sent
 * was `kab` followed by a left-to-right mark — an invisible character that
 * matches no town. Worse, the mark survived the backspaces that took the
 * letters away, so the list stayed empty with an apparently empty box.
 */
const INVISIBLE = /[­ـ​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function cleanQuery(raw: string): string {
  return raw
    .replace(INVISIBLE, "")
    // A keyboard set to Arabic sends ٠-٩; the register's names carry 0-9.
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, " ")
    .trim();
}

export type LocationValue = { country: string; countryKey: string; city: string };

type Country = { code: string; key: string; name: string; cityCount: number };
type City = { name: string };

/**
 * Afkar delivers to Jerusalem and the West Bank, and the register holds only
 * eight Palestinian towns against 1,138 Israeli ones — so typing a town by
 * hand is not a courtesy here, it is the difference between registering and
 * not. The typed name is stored exactly as written, with no marker.
 */
export function LocationPicker({
  value,
  onChange,
  defaultCountryKey = "Israel",
  allowManual = true
}: {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  defaultCountryKey?: string | null;
  allowManual?: boolean;
}) {
  const [open, setOpen] = useState<null | "country" | "city">(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [broken, setBroken] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * How much of the screen the on-screen keyboard is covering. iOS does not
   * shrink the page when the keyboard opens — it shrinks only the visual
   * viewport and slides the page under it, so a sheet anchored to the bottom
   * ends up behind the keys.
   */
  const [view, setView] = useState({ visible: 0 });
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) {
      return;
    }
    const measure = () => setView({ visible: Math.round(vv.height) });
    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, []);

  // Applied once. `value` is deliberately not a dependency: reacting to it
  // would re-select the default the moment someone clears the country.
  const defaulted = useRef(false);
  const applyDefault = useCallback(
    (list: Country[]) => {
      if (defaulted.current || !defaultCountryKey) {
        return;
      }
      defaulted.current = true;
      if (value.countryKey) {
        return;
      }
      const home = list.find((item) => item.key === defaultCountryKey);
      if (home) {
        onChange({ country: home.name, countryKey: home.key, city: "" });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the note above
    [defaultCountryKey]
  );

  useEffect(() => {
    fetch(`${LOCATIONS}/countries?lang=ar`)
      .then((response) => response.json())
      .then((payload) => {
        const list: Country[] = payload.countries ?? [];
        setCountries(list);
        setBroken(list.length === 0);
        applyDefault(list);
      })
      .catch(() => {
        setCountries([]);
        setBroken(true);
      });
  }, [applyDefault]);

  /**
   * The search term goes to the server, and this is not an optimisation: the
   * register answers with at most 400 towns while Israel has 1,138, so
   * filtering the received page in the browser searches the first 400 names
   * alphabetically and nothing else.
   */
  useEffect(() => {
    if (!value.countryKey) {
      setCities([]);
      return;
    }

    const needle = cleanQuery(query);
    let live = true;

    const timer = setTimeout(
      () => {
        setLoading(true);
        fetch(
          `${LOCATIONS}/cities?country=${encodeURIComponent(value.countryKey)}&lang=ar` +
            (needle ? `&q=${encodeURIComponent(needle)}` : "")
        )
          .then((response) => response.json())
          .then((payload) => {
            if (live) {
              setCities(payload.cities ?? []);
            }
          })
          .catch(() => {
            if (live) {
              setCities([]);
            }
          })
          .finally(() => {
            if (live) {
              setLoading(false);
            }
          });
      },
      // Typing is answered from the register; the first, unfiltered page is not.
      needle ? 220 : 0
    );

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value.countryKey, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setManual(false);
      setManualText("");
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [open]);

  const rows = useMemo(() => {
    if (open === "country") {
      const needle = cleanQuery(query).toLowerCase();
      return needle
        ? countries.filter(
            (item) => item.name.toLowerCase().includes(needle) || item.key.toLowerCase().includes(needle)
          )
        : countries;
    }
    // Towns arrive already filtered by the register.
    return open === "city" ? cities : [];
  }, [open, query, countries, cities]);

  const onPhone = typeof window !== "undefined" && window.innerWidth < 640;
  const sheetHeight =
    onPhone && view.visible
      ? { height: Math.min(Math.round(window.innerHeight * 0.7), view.visible - 16) }
      : undefined;

  function confirmManual() {
    const city = manualText.trim();
    if (!city) {
      return;
    }
    onChange({ ...value, city });
    setOpen(null);
  }

  const sheet =
    open && typeof document !== "undefined"
      ? createPortal(
          // A portal because an ancestor card animates in with a transform that
          // never releases, and a fixed sheet inside it is measured against the
          // card instead of the window — which clipped the search box away.
          <div className="pickerBackdrop" onMouseDown={() => setOpen(null)}>
            <div
              className="pickerSheet"
              dir="rtl"
              onMouseDown={(event) => event.stopPropagation()}
              style={sheetHeight}
            >
              <div className="pickerGrip" />
              <header>
                <strong>{manual ? "اكتب اسم البلدة" : open === "country" ? "اختر الدولة" : "اختر البلدة"}</strong>
                <button aria-label="إغلاق" onClick={() => setOpen(null)} type="button">
                  ✕
                </button>
              </header>

              {manual ? (
                <div className="pickerManual">
                  <input
                    autoFocus
                    onChange={(event) => setManualText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirmManual();
                      }
                    }}
                    placeholder="اسم البلدة"
                    value={manualText}
                  />
                  <button disabled={!manualText.trim()} onClick={confirmManual} type="button">
                    تأكيد
                  </button>
                  <button className="pickerLink" onClick={() => setManual(false)} type="button">
                    رجوع للقائمة
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className="pickerSearch"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ابحث…"
                    ref={searchRef}
                    value={query}
                  />

                  <div className="pickerList">
                    {loading && open === "city" ? <p className="pickerNote">جاري التحميل…</p> : null}
                    {!loading && !rows.length ? <p className="pickerNote">ما في نتيجة.</p> : null}

                    {rows.slice(0, 300).map((row) => {
                      const isCountry = open === "country";
                      const name = isCountry ? (row as Country).name : (row as City).name;
                      const chosen = isCountry ? value.countryKey === (row as Country).key : value.city === name;
                      return (
                        <button
                          className={chosen ? "pickerRow chosen" : "pickerRow"}
                          key={isCountry ? (row as Country).key : name}
                          onClick={() => {
                            if (isCountry) {
                              const country = row as Country;
                              // Changing country clears the town — otherwise
                              // "Tamra, France".
                              onChange({ country: country.name, countryKey: country.key, city: "" });
                              setOpen("city");
                              return;
                            }
                            onChange({ ...value, city: name });
                            setOpen(null);
                          }}
                          type="button"
                        >
                          {name}
                        </button>
                      );
                    })}

                    {rows.length > 300 ? <p className="pickerNote">أول 300 نتيجة — دوّر باسم أدق.</p> : null}

                    {allowManual && open === "city" ? (
                      <button className="pickerRow manual" onClick={() => setManual(true)} type="button">
                        بلدتك مش بالقائمة؟ اكتبها بإيدك
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="pickerSlots">
      {broken ? (
        <p className="pickerBroken">تعذّر تحميل قائمة البلدات. حدّث الصفحة، وإذا ظلّت المشكلة تواصل معنا.</p>
      ) : null}

      <button className="pickerSlot" onClick={() => setOpen("country")} type="button">
        <span className="pickerSlotLabel">الدولة</span>
        <span className={value.country ? "pickerSlotValue" : "pickerSlotValue empty"}>
          {value.country || "اختر الدولة"}
        </span>
      </button>

      <button
        className="pickerSlot"
        disabled={!value.countryKey}
        onClick={() => setOpen("city")}
        type="button"
      >
        <span className="pickerSlotLabel">البلدة</span>
        <span className={value.city ? "pickerSlotValue" : "pickerSlotValue empty"}>
          {value.city || (value.countryKey ? "اختر البلدة" : "اختر الدولة أول")}
        </span>
      </button>

      {sheet}
    </div>
  );
}
