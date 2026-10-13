"use client";

function formatLabel(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Detail";
}

function formatValue(value, key) {
  if (
    typeof value === "string" &&
    /date|dob|birth/i.test(key) &&
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)
  ) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function isEmpty(value) {
  return value === null || value === undefined || value === "";
}

function updateAtPath(value, path, nextValue) {
  if (!path.length) return nextValue;
  const [head, ...tail] = path;
  const clone = Array.isArray(value) ? [...value] : { ...value };
  clone[head] = updateAtPath(value?.[head], tail, nextValue);
  return clone;
}

function DataValue({ label, value }) {
  if (isEmpty(value)) return null;

  if (Array.isArray(value)) {
    if (!value.length) return null;
    return (
      <section className="min-w-0">
        <h4 className="text-sm font-semibold text-slate-800">{formatLabel(label)}</h4>
        <ol className="mt-2 space-y-2">
          {value.map((item, index) => (
            <li
              key={`${label}-${index}`}
              className="min-w-0 rounded-lg border border-slate-200/70 bg-white/80 p-3"
            >
              {item !== null && typeof item === "object" ? (
                <DataObject value={item} />
              ) : (
                <p className="break-words text-sm leading-6 text-slate-700">
                  {formatValue(item, label)}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (typeof value === "object") {
    return (
      <section className="min-w-0">
        <h4 className="text-sm font-semibold text-slate-800">{formatLabel(label)}</h4>
        <div className="mt-2 rounded-lg border border-slate-200/70 bg-white/80 p-3 sm:p-4">
          <DataObject value={value} />
        </div>
      </section>
    );
  }

  return (
    <div className="min-w-0 border-b border-slate-100 py-3 last:border-0">
      <dt className="text-xs font-medium text-slate-500">{formatLabel(label)}</dt>
      <dd className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-slate-900">
        {typeof value === "boolean" ? (value ? "Yes" : "No") : formatValue(value, label)}
      </dd>
    </div>
  );
}

function DataObject({ value }) {
  const entries = Object.entries(value || {}).filter(([, item]) => !isEmpty(item));
  if (!entries.length) {
    return <p className="text-sm text-slate-500">No details provided.</p>;
  }

  return (
    <dl className="grid min-w-0 gap-x-6 sm:grid-cols-2">
      {entries.map(([key, item]) => (
        <DataValue key={key} label={key} value={item} />
      ))}
    </dl>
  );
}

export function ExtractedDataViewer({ data, className = "" }) {
  if (data === null || data === undefined || data === "") {
    return (
      <p className={`text-sm text-slate-500 ${className}`}>
        There are no extracted details to show.
      </p>
    );
  }

  if (Array.isArray(data)) {
    if (!data.length) {
      return (
        <p className={`text-sm text-slate-500 ${className}`}>
          There are no extracted details to show.
        </p>
      );
    }
    return (
      <div className={`min-w-0 ${className}`}>
        <DataValue label="Items" value={data} />
      </div>
    );
  }

  if (typeof data !== "object") {
    return (
      <dl className={`min-w-0 ${className}`}>
        <DataValue label="Value" value={data} />
      </dl>
    );
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <DataObject value={data} />
    </div>
  );
}

function EditableValue({ label, value, path, onChange }) {
  if (Array.isArray(value)) {
    return (
      <fieldset className="min-w-0 rounded-lg border border-slate-200 bg-white/70 p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          {formatLabel(label)}
        </legend>
        <div className="space-y-3">
          {value.length ? value.map((item, index) => (
            <div key={`${path.join(".")}-${index}`} className="min-w-0">
              {item !== null && typeof item === "object" ? (
                <EditableObject
                  value={item}
                  path={[...path, index]}
                  onChange={onChange}
                />
              ) : (
                <PrimitiveEditor
                  label={`${formatLabel(label)} ${index + 1}`}
                  value={item}
                  path={[...path, index]}
                  onChange={onChange}
                />
              )}
            </div>
          )) : (
            <p className="text-sm text-slate-500">No items to edit.</p>
          )}
        </div>
      </fieldset>
    );
  }

  if (value !== null && typeof value === "object") {
    return (
      <fieldset className="min-w-0 rounded-lg border border-slate-200 bg-white/70 p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          {formatLabel(label)}
        </legend>
        <EditableObject value={value} path={path} onChange={onChange} />
      </fieldset>
    );
  }

  return (
    <PrimitiveEditor
      label={formatLabel(label)}
      value={value}
      path={path}
      onChange={onChange}
    />
  );
}

function PrimitiveEditor({ label, value, path, onChange }) {
  if (typeof value === "boolean") {
    return (
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(path, event.target.checked)}
          className="h-4 w-4 accent-indigo-600"
        />
        {label}
      </label>
    );
  }

  const inputClass =
    "mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
  const textValue = value === null || value === undefined ? "" : String(value);
  const isLongText = textValue.includes("\n") || textValue.length > 160;

  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700">
      {label}
      {isLongText ? (
        <textarea
          value={textValue}
          onChange={(event) =>
            onChange(path, typeof value === "number" ? Number(event.target.value) : event.target.value)
          }
          rows={3}
          className={inputClass}
        />
      ) : (
        <input
          type={typeof value === "number" ? "number" : "text"}
          step={typeof value === "number" ? "any" : undefined}
          value={textValue}
          onChange={(event) => {
            const next = event.target.value;
            onChange(
              path,
              typeof value === "number" && next !== "" ? Number(next) : next
            );
          }}
          className={inputClass}
        />
      )}
    </label>
  );
}

function EditableObject({ value, path = [], onChange }) {
  const entries = Object.entries(value || {});
  if (!entries.length) {
    return <p className="text-sm text-slate-500">There are no fields to edit.</p>;
  }

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {entries.map(([key, item]) => (
        <EditableValue
          key={key}
          label={key}
          value={item}
          path={[...path, key]}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

export function ExtractedDataEditor({ data, onChange }) {
  return (
    <EditableObject
      value={data}
      onChange={(path, nextValue) => onChange(updateAtPath(data, path, nextValue))}
    />
  );
}
