"use client";

import { useState, useRef, useEffect } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Icono SVG para importar
const IconUpload = () => (
  <svg className="w-12 h-12 text-surface-400 mx-auto" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const IconTrash = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const IconUndo = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
  </svg>
);

const IconX = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

type Step = "upload" | "map" | "result";

export default function ImportarPage() {
  const [step, setStep] = useState<Step>("upload");
  const [tipo, setTipo] = useState<"PREDIO" | "EQUIPO">("PREDIO");
  const [parseResult, setParseResult] = useState<any>(null);
  const [mappings, setMappings] = useState<Record<number, string>>({});
  const [dbFields, setDbFields] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [excludedCols, setExcludedCols] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // Espacios de trabajo
  const [espacios, setEspacios] = useState<any[]>([]);
  const [espacioId, setEspacioId] = useState<string>("");
  const [showNewEspacio, setShowNewEspacio] = useState(false);
  const [nuevoEspacioNombre, setNuevoEspacioNombre] = useState("");
  const [creandoEspacio, setCreandoEspacio] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  // Campos personalizados existentes y nuevos a crear
  const [customFields, setCustomFields] = useState<{ clave: string; nombre: string }[]>([]);
  const [newCustomFields, setNewCustomFields] = useState<Record<number, string>>({}); // colIdx → nombre
  // Columna seleccionada para preview dinámico
  const [selectedPreviewCol, setSelectedPreviewCol] = useState<number | null>(null);

  // Cargar campos disponibles + campos personalizados
  useEffect(() => {
    fetch("/api/importar/ejecutar", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setDbFields(tipo === "PREDIO" ? data.predioFields : data.equipoFields);
        if (data.camposPersonalizados) {
          setCustomFields(data.camposPersonalizados.map((c: any) => ({ clave: c.clave, nombre: c.nombre })));
        }
      });
  }, [tipo]);

  // Cargar espacios disponibles
  useEffect(() => {
    if (tipo !== "PREDIO") return;
    fetch("/api/espacios", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        // Aplanar el árbol para un select plano con indentación
        const flat: any[] = [];
        function flatten(nodes: any[], depth: number) {
          for (const n of nodes) {
            flat.push({ ...n, _depth: depth });
            if (n.children?.length) flatten(n.children, depth + 1);
            else if (n.hijos?.length) flatten(n.hijos, depth + 1);
          }
        }
        flatten(data.espacios || [], 0);
        setEspacios(flat);
      })
      .catch(() => {});
  }, [tipo]);

  async function crearNuevoEspacio() {
    if (!nuevoEspacioNombre.trim()) return;
    setCreandoEspacio(true);
    try {
      const body: any = { nombre: nuevoEspacioNombre.trim(), color: "#3b82f6" };
      // Si hay un espacio seleccionado, crear como subcarpeta dentro de él
      if (espacioId) {
        body.parentId = espacioId;
      }
      const res = await fetch("/api/espacios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        // Recalcular la profundidad: si tiene padre, es padre._depth + 1, sino 0
        const parentDepth = espacioId ? (espacios.find(e => e.id === espacioId)?._depth || 0) : -1;
        const newDepth = parentDepth + 1;
        // Insertar después del padre en la lista plana
        if (espacioId) {
          const parentIdx = espacios.findIndex(e => e.id === espacioId);
          let insertAt = parentIdx + 1;
          // Saltar todos los hijos existentes del padre
          while (insertAt < espacios.length && espacios[insertAt]._depth > parentDepth) {
            insertAt++;
          }
          setEspacios((prev) => {
            const copy = [...prev];
            copy.splice(insertAt, 0, { ...created, _depth: newDepth });
            return copy;
          });
        } else {
          setEspacios((prev) => [...prev, { ...created, _depth: 0 }]);
        }
        setEspacioId(created.id);
        setShowNewEspacio(false);
        setNuevoEspacioNombre("");
      }
    } catch { /* ignore */ }
    setCreandoEspacio(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError("");
    }
  }

  async function handleUpload() {
    const file = selectedFile || fileRef.current?.files?.[0];
    if (!file) {
      setError("Selecciona un archivo primero");
      return;
    }

    setError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("sheetIndex", "0");

    const res = await fetch("/api/importar/parse", { method: "POST", credentials: "include", body: fd });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al procesar archivo");
      return;
    }

    const data = await res.json();
    setParseResult(data);
    setExcludedRows(new Set());
    setExcludedCols(new Set());

    // Auto-mapeo: detectar columnas por nombre del header
    const autoMappings: Record<number, string> = {};
    const usedFields = new Set<string>();
    if (data.headers) {
      const predioAliases: Record<string, string[]> = {
        codigo:    ["predio", "codigo", "código", "code", "id_predio", "nro_predio", "numpredio", "numerodepredio"],
        nombre:    ["nombre", "name", "cue_nombre", "nombredelatarea", "tarea", "task"],
        latitud:   ["latitud", "lat", "latitude", "latitud_gps"],
        longitud:  ["longitud", "lng", "lon", "longitude", "long", "longitud_gps"],
        direccion: ["direccion", "dirección", "address", "dir"],
        ciudad:    ["ciudad", "city", "localidad", "departamento", "depto"],
        provincia: ["provincia", "province", "prov"],
        incidencias: ["incidencia", "incidencias", "ni", "ni-", "númerodeinci", "numerodeinci"],
        cue:       ["cue", "consolidadodecues", "consolidado"],
        ambito:    ["ambito", "ámbito", "predioambito"],
        equipoAsignado: ["equipo", "team", "equipo_asignado", "equipoasignado", "tecnico", "técnico"],
        lacR:      ["lac", "lacr", "lac-r", "lac_r"],
        cuePredio: ["cue_predio", "cuepredioconsolidadodecues", "cuePredio"],
        gpsPredio: ["gps", "gps_predio", "gpspredio", "coordenadas", "coordenadasgps", "gpsdecimal"],
        fechaDesde: ["desde", "fecha_desde", "inicio", "start"],
        fechaHasta: ["hasta", "fecha_hasta", "fin", "end"],
        seccion:   ["seccion", "sección"],
        tipo:      ["tipo", "type"],
        notas:     ["notas", "nota", "notes", "observaciones"],
        prioridad: ["prioridad", "priority"],
        tipoRed: ["tipo_red", "tipodered", "tipored", "tipo_de_red", "prediotipodered"],
        codigoPostal: ["codigopostal", "codigo_postal", "cod_postal", "código_postal", "cp"],
        caracteristicaTelefonica: ["caracteristica", "caracteristicatelefonica", "caracteristica_telefonica", "car_tel", "coddearea", "codigodearea", "cod_de_area", "codarea", "areatelefonica"],
        telefono: ["telefono", "tel", "phone", "teléfono", "nro_tel", "nro_telefono", "nrotelefono"],
        lab: ["lab", "proveedorlab", "predioproveedorlab"],
        nombreInstitucion: ["institucion", "institución", "nombre_institucion", "nombreinstitucion", "escuela", "nombredelainstitucion", "establecimiento", "nombredelestablecimiento"],
        correo: ["correo", "email", "mail", "e-mail", "correo_electronico"],
        asignado: ["asignado", "tecnico", "técnico", "responsable", "assigned", "asignado_a", "personaasignada"],
        estado: ["estado", "status", "state"],
        orden: ["orden", "order", "nro_orden", "nroorden"],
      };

      const equipoAliases: Record<string, string[]> = {
        nombre:      ["nombre", "name", "equipo", "dispositivo", "device"],
        descripcion: ["descripcion", "descripción", "desc", "detalle"],
        numeroSerie: ["numero_serie", "numeroserie", "n/s", "ns", "serial", "serie", "sn", "numero_de_serie"],
        modelo:      ["modelo", "model"],
        marca:       ["marca", "brand", "fabricante"],
        cantidad:    ["cantidad", "cant", "qty", "quantity", "unidades"],
        estado:      ["estado", "status", "state"],
        categoria:   ["categoria", "categoría", "cat", "category", "tipo", "type"],
        ubicacion:   ["ubicacion", "ubicación", "location", "lugar", "sitio", "sede"],
        notas:       ["notas", "nota", "notes", "observaciones", "comentarios"],
        fecha:       ["fecha", "date", "fecha_ingreso", "fecha_alta", "fechaingreso", "fechaalta", "f_ingreso", "ingreso"],
        asignado:    ["asignado", "asignado_a", "asignadoa", "tecnico", "técnico", "technician", "asignacion", "asignación"],
      };

      const aliases = tipo === "EQUIPO" ? equipoAliases : predioAliases;

      // Scoring-based auto-mapping: collect all potential matches with scores
      const candidates: { col: number; field: string; score: number }[] = [];
      for (let i = 0; i < data.headers.length; i++) {
        const raw = data.headers[i]?.toString().toLowerCase().trim();
        if (!raw) continue;
        const hCompact = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]/g, "");
        const hWords = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ");
        for (const [field, aliasList] of Object.entries(aliases)) {
          let bestScore = 0;
          for (const a of aliasList) {
            let s = 0;
            if (hCompact === a) s = 100;                                                         // exact
            else if (hWords.some((w: string) => w === a && a.length >= 3)) s = 80;               // word match
            else if (a.length >= 5 && hCompact === a.replace(/[_-]/g, "")) s = 95;               // exact ignoring separators
            else if (a.length >= 5 && (hCompact.startsWith(a) || a.startsWith(hCompact))) s = 50; // prefix (long alias only)
            else if (a.length >= 6 && hCompact.includes(a)) s = 30;                              // contains (long alias only)
            if (s > bestScore) bestScore = s;
          }
          if (bestScore > 0) candidates.push({ col: i, field, score: bestScore });
        }
      }
      // Sort by score desc → assign greedily (no col/field reuse)
      candidates.sort((a, b) => b.score - a.score);
      const usedCols = new Set<number>();
      for (const { col, field } of candidates) {
        if (usedCols.has(col) || usedFields.has(field)) continue;
        autoMappings[col] = field;
        usedFields.add(field);
        usedCols.add(col);
      }
    }
    setMappings(autoMappings);
    // Si hay código mapeado, activar "Actualizar existentes" automáticamente
    if (usedFields.has("codigo")) {
      setUpdateExisting(true);
    }
    setStep("map");
  }

  async function handleImport() {
    if (!parseResult) return;
    setImporting(true);
    setError("");

    // 1) Crear campos personalizados nuevos antes de importar
    const resolvedMappings = { ...mappings };
    const newCustomEntries = Object.entries(newCustomFields);
    if (newCustomEntries.length > 0) {
      try {
        const camposToCreate = newCustomEntries.map(([, nombre]) => ({ nombre }));
        const res = await fetch("/api/campos-personalizados", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(camposToCreate),
        });
        if (res.ok) {
          const createdFields = await res.json();
          const created = Array.isArray(createdFields) ? createdFields : [createdFields];
          // Mapear cada columna _new_custom a custom:clave
          for (const [colStr, nombre] of newCustomEntries) {
            const col = parseInt(colStr);
            const match = created.find((c: any) => c.nombre === nombre);
            if (match) {
              resolvedMappings[col] = `custom:${match.clave}`;
            }
          }
        }
      } catch {
        setError("Error al crear campos personalizados");
        setImporting(false);
        return;
      }
    }

    // 2) Filtrar mapeos de columnas excluidas
    const mappingArray = Object.entries(resolvedMappings)
      .filter(([col, field]) => field !== "_skip" && field !== "_new_custom" && !excludedCols.has(parseInt(col)))
      .map(([col, field]) => ({ excelColumn: parseInt(col), dbField: field }));

    const res = await fetch("/api/importar/ejecutar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        tipo,
        mappings: mappingArray,
        rows: parseResult.rows.filter((_: string[], i: number) => !excludedRows.has(i)),
        espacioId: espacioId || undefined,
        updateExisting,
      }),
    });

    const data = await res.json();
    setImporting(false);

    if (res.ok) {
      setResult(data);
      setStep("result");
    } else {
      setError(data.error || "Error al importar");
    }
  }

  function reset() {
    setStep("upload");
    setParseResult(null);
    setMappings({});
    setNewCustomFields({});
    setSelectedPreviewCol(null);
    setResult(null);
    setError("");
    setSelectedFile(null);
    setExcludedRows(new Set());
    setExcludedCols(new Set());
    setEspacioId("");
    setShowNewEspacio(false);
    setNuevoEspacioNombre("");
    setUpdateExisting(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleRowExclusion(rowIndex: number) {
    setExcludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }

  function toggleColExclusion(colIndex: number) {
    setExcludedCols((prev) => {
      const next = new Set(prev);
      if (next.has(colIndex)) {
        next.delete(colIndex);
      } else {
        next.add(colIndex);
        // Si la columna estaba mapeada, quitarla del mapeo
        setMappings((m) => {
          const updated = { ...m };
          delete updated[colIndex];
          return updated;
        });
      }
      return next;
    });
  }

  const activeRowsCount = parseResult ? parseResult.totalRows - excludedRows.size : 0;
  const activeColsCount = parseResult ? parseResult.headers.length - excludedCols.size : 0;

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-xl font-semibold text-surface-800 mb-1">Importar</h1>
      <p className="text-xs text-surface-400 mb-6">Importar datos desde archivos Excel o CSV</p>

      {/* Paso 1: Subir archivo */}
      {step === "upload" && (
        <div className="bg-white rounded-lg border border-surface-200 p-6">
          <div className="max-w-lg mx-auto space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-2">Tipo de importación</label>
              <div className="flex gap-3">
                <button onClick={() => setTipo("PREDIO")} className={`flex-1 py-2.5 rounded-md text-xs font-medium transition-colors ${tipo === "PREDIO" ? "bg-surface-800 text-white" : "bg-surface-100 text-surface-600 hover:bg-surface-200"}`}>
                  Predios / Tareas
                </button>
                <button onClick={() => setTipo("EQUIPO")} className={`flex-1 py-2.5 rounded-md text-xs font-medium transition-colors ${tipo === "EQUIPO" ? "bg-surface-800 text-white" : "bg-surface-100 text-surface-600 hover:bg-surface-200"}`}>
                  Equipos / Stock
                </button>
              </div>
            </div>

            {/* Espacio de trabajo (solo para Predios) */}
            {tipo === "PREDIO" && (
              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-2">Espacio de trabajo</label>
                {!showNewEspacio ? (
                  <div className="flex gap-2">
                    <select
                      value={espacioId}
                      onChange={(e) => setEspacioId(e.target.value)}
                      className="flex-1 px-3 py-2.5 border border-surface-200 rounded-md text-xs text-surface-700 focus:outline-none focus:border-primary-400"
                    >
                      <option value="">— Sin espacio (general) —</option>
                      {espacios.map((e) => (
                        <option key={e.id} value={e.id}>
                          {"  ".repeat(e._depth)}{e._depth > 0 ? "└ " : ""}{e.nombre}
                          {e._count?.predios != null ? ` (${e._count.predios})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewEspacio(true)}
                      className="px-3 py-2 border border-dashed border-surface-300 rounded-md text-xs text-surface-500 hover:border-primary-400 hover:text-primary-600 transition-colors whitespace-nowrap"
                    >
                      {espacioId ? "+ Subcarpeta" : "+ Nuevo"}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={nuevoEspacioNombre}
                      onChange={(e) => setNuevoEspacioNombre(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && crearNuevoEspacio()}
                      placeholder={espacioId ? "Nombre de la subcarpeta..." : "Nombre del espacio..."}
                      className="flex-1 px-3 py-2.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-primary-400"
                      autoFocus
                    />
                    <button
                      onClick={crearNuevoEspacio}
                      disabled={creandoEspacio || !nuevoEspacioNombre.trim()}
                      className="px-4 py-2 bg-primary-600 text-white rounded-md text-xs font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                      {creandoEspacio ? "..." : "Crear"}
                    </button>
                    <button
                      onClick={() => { setShowNewEspacio(false); setNuevoEspacioNombre(""); }}
                      className="px-3 py-2 text-xs text-surface-500 hover:text-surface-700"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-surface-400 mt-1.5">
                  {espacioId
                    ? "Espacio seleccionado. Usa \"+ Subcarpeta\" para crear una carpeta dentro de él."
                    : "Selecciona un espacio para organizar las tareas importadas"}
                </p>
              </div>
            )}

            <label className="block border-2 border-dashed border-surface-200 rounded-lg p-8 text-center cursor-pointer hover:border-surface-400 hover:bg-surface-50 transition-colors">
              <IconUpload />
              <p className="text-xs text-surface-600 mt-3 mb-2">
                {selectedFile ? selectedFile.name : "Haz clic o arrastra un archivo .xlsx, .xls o .csv"}
              </p>
              {selectedFile && (
                <p className="text-[10px] text-surface-500 font-medium">Archivo seleccionado</p>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
            </label>

            {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

            <button onClick={handleUpload} disabled={!selectedFile} className="w-full py-2.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Procesar archivo
            </button>
          </div>
        </div>
      )}

      {/* Paso 2: Mapear columnas */}
      {step === "map" && parseResult && (
        <div className="space-y-4">
          <div className="flex gap-4">
          {/* Panel izquierdo: Mapeo */}
          <div className="flex-1 min-w-0 bg-white rounded-lg border border-surface-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-surface-800">Mapeo de columnas</h2>
                <p className="text-xs text-surface-500">
                  {parseResult.fileName} · {activeRowsCount} de {parseResult.totalRows} filas
                  {excludedRows.size > 0 && <span className="text-red-500"> ({excludedRows.size} filas excluidas)</span>}
                  {excludedCols.size > 0 && <span className="text-red-500"> ({excludedCols.size} cols excluidas)</span>}
                  {" "}· Hoja: {parseResult.sheetNames[parseResult.currentSheet]}
                </p>
                {Object.keys(mappings).length > 0 && (
                  <p className="text-[11px] text-emerald-600 mt-1">
                    {Object.values(mappings).filter(v => v !== "_skip").length} columnas detectadas automáticamente
                  </p>
                )}
              </div>
              <button onClick={reset} className="text-sm text-surface-500 hover:text-surface-700">Cambiar archivo</button>
            </div>

            <div className="grid gap-2">
              {parseResult.headers.map((header: string, i: number) => {
                const isColExcluded = excludedCols.has(i);
                const isNewCustom = mappings[i] === "_new_custom";
                const isSelected = selectedPreviewCol === i;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer ${
                      isColExcluded ? "bg-red-50 opacity-60" :
                      isNewCustom ? "bg-violet-50" :
                      isSelected ? "bg-primary-50 ring-1 ring-primary-300" :
                      "bg-surface-50 hover:bg-surface-100"
                    }`}
                    onClick={() => setSelectedPreviewCol(isSelected ? null : i)}
                  >
                    <span className={`text-sm w-48 truncate font-mono ${isColExcluded ? "text-surface-400 line-through" : "text-surface-600"}`}>{header}</span>
                    <span className="text-surface-300">→</span>
                    {isColExcluded ? (
                      <span className="flex-1 px-3 py-1.5 text-sm text-red-500 italic">Columna excluida</span>
                    ) : isNewCustom ? (
                      <div className="flex-1 flex items-center gap-2">
                        <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded text-xs font-medium">
                          Campo personalizado: &quot;{newCustomFields[i] || header}&quot;
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMappings(prev => ({ ...prev, [i]: "_skip" }));
                            setNewCustomFields(prev => { const n = { ...prev }; delete n[i]; return n; });
                          }}
                          className="text-xs text-surface-500 hover:text-surface-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <select
                        value={mappings[i] || "_skip"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "_new_custom") {
                            setMappings(prev => ({ ...prev, [i]: "_new_custom" }));
                            setNewCustomFields(prev => ({ ...prev, [i]: header }));
                          } else {
                            setMappings(prev => ({ ...prev, [i]: val }));
                            setNewCustomFields(prev => { const n = { ...prev }; delete n[i]; return n; });
                          }
                        }}
                        className={`flex-1 px-3 py-1.5 border rounded-lg text-sm ${
                          mappings[i] && mappings[i] !== "_skip" ? "border-emerald-300 bg-emerald-50" : "border-surface-300"
                        }`}
                      >
                        <option value="_skip">— Omitir —</option>
                        <optgroup label="Campos del sistema">
                          {Object.entries(dbFields).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </optgroup>
                        {customFields.length > 0 && (
                          <optgroup label="Campos personalizados">
                            {customFields.map(cf => (
                              <option key={`custom:${cf.clave}`} value={`custom:${cf.clave}`}>{cf.nombre}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Nuevo">
                          <option value="_new_custom">+ Agregar como campo personalizado</option>
                        </optgroup>
                      </select>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleColExclusion(i); }}
                      className={`p-1.5 rounded-lg transition-colors ${isColExcluded ? "text-green-600 hover:bg-green-100" : "text-red-500 hover:bg-red-100"}`}
                      title={isColExcluded ? "Restaurar columna" : "Excluir columna"}
                    >
                      {isColExcluded ? <IconUndo /> : <IconX />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panel derecho: Preview dinámico de columna seleccionada */}
          {selectedPreviewCol !== null && (
            <div className="w-72 flex-shrink-0 bg-white rounded-lg border border-surface-200 p-4 hidden lg:block max-h-[600px] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-surface-800 text-sm truncate">
                  {parseResult.headers[selectedPreviewCol]}
                </h3>
                <button
                  onClick={() => setSelectedPreviewCol(null)}
                  className="text-surface-400 hover:text-surface-600"
                >
                  <IconX />
                </button>
              </div>
              {mappings[selectedPreviewCol] && mappings[selectedPreviewCol] !== "_skip" && (
                <p className="text-[10px] text-emerald-600 mb-2 font-medium">
                  → {dbFields[mappings[selectedPreviewCol]] || mappings[selectedPreviewCol]}
                </p>
              )}
              <div className="space-y-1">
                {parseResult.rows.slice(0, 50).map((row: string[], ri: number) => {
                  const val = row[selectedPreviewCol] ?? "";
                  const isRowExcluded = excludedRows.has(ri);
                  return (
                    <div
                      key={ri}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                        isRowExcluded ? "text-surface-300 line-through bg-red-50/50" : "text-surface-700 bg-surface-50"
                      }`}
                    >
                      <span className="text-[10px] text-surface-400 w-5 text-right font-mono flex-shrink-0">{ri + 1}</span>
                      <span className="truncate">{val || <span className="text-surface-300 italic">vacío</span>}</span>
                    </div>
                  );
                })}
                {parseResult.rows.length > 50 && (
                  <p className="text-[10px] text-surface-400 text-center pt-1">
                    ... y {parseResult.rows.length - 50} filas más
                  </p>
                )}
              </div>
            </div>
          )}
          </div>

          {/* Preview con opción de eliminar filas */}
          <div className="bg-white rounded-lg border border-surface-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-surface-800 text-sm">Vista previa de datos</h3>
              <div className="flex gap-3">
                {excludedCols.size > 0 && (
                  <button
                    onClick={() => setExcludedCols(new Set())}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                  >
                    <IconUndo className="w-3 h-3" /> Restaurar columnas
                  </button>
                )}
                {excludedRows.size > 0 && (
                  <button
                    onClick={() => setExcludedRows(new Set())}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                  >
                    <IconUndo className="w-3 h-3" /> Restaurar filas
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-surface-200 rounded-lg">
              <table className="text-xs w-full">
                <thead className="sticky top-0 bg-surface-50 z-10">
                  <tr className="border-b border-surface-200">
                    <th className="text-left px-2 py-2 text-surface-500 font-medium w-10">#</th>
                    {parseResult.headers.map((h: string, i: number) => {
                      const isColExcluded = excludedCols.has(i);
                      return (
                        <th key={i} className={`text-left px-2 py-2 font-medium whitespace-nowrap ${isColExcluded ? "text-red-400 line-through bg-red-50" : "text-surface-500"}`}>
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[150px]">{h}</span>
                            <button
                              onClick={() => toggleColExclusion(i)}
                              className={`p-0.5 rounded transition-colors ${isColExcluded ? "text-green-600 hover:bg-green-100" : "text-red-400 hover:bg-red-100"}`}
                              title={isColExcluded ? "Restaurar columna" : "Excluir columna"}
                            >
                              {isColExcluded ? <IconUndo className="w-3 h-3" /> : <IconX className="w-3 h-3" />}
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    <th className="text-center px-2 py-2 text-surface-500 font-medium w-20">Fila</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.rows.map((row: string[], ri: number) => {
                    const isRowExcluded = excludedRows.has(ri);
                    return (
                      <tr key={ri} className={`border-b border-surface-100 transition-colors ${isRowExcluded ? "bg-red-50/50" : "hover:bg-surface-50"}`}>
                        <td className={`px-2 py-1.5 font-mono ${isRowExcluded ? "text-red-400" : "text-surface-400"}`}>{ri + 1}</td>
                        {row.map((cell: string, ci: number) => {
                          const isColExcluded = excludedCols.has(ci);
                          return (
                            <td
                              key={ci}
                              className={`px-2 py-1.5 truncate max-w-[200px] ${
                                isRowExcluded || isColExcluded ? "text-surface-300 line-through" : "text-surface-600"
                              } ${isColExcluded ? "bg-red-50/30" : ""}`}
                            >
                              {cell}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => toggleRowExclusion(ri)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isRowExcluded
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-red-100 text-red-600 hover:bg-red-200"
                            }`}
                            title={isRowExcluded ? "Restaurar fila" : "Excluir fila"}
                          >
                            {isRowExcluded ? <IconUndo className="w-3.5 h-3.5" /> : <IconTrash className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-surface-400 mt-2">Usa los botones <span className="text-red-500">✕</span> en las columnas o <span className="text-red-500">eliminar</span> en las filas para excluir datos</p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setStep("upload")} className="px-4 py-2 text-xs text-surface-600 border border-surface-200 rounded-md hover:bg-surface-50">← Volver</button>
            <button onClick={reset} className="px-4 py-2 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50">Cancelar</button>
            <label className="flex items-center gap-1.5 text-xs text-surface-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
              />
              Actualizar existentes (sobreescribir duplicados)
            </label>
            <button onClick={handleImport} disabled={importing || activeRowsCount === 0 || activeColsCount === 0 || Object.values(mappings).filter((v) => v !== "_skip").length === 0} className="flex-1 py-2 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 disabled:opacity-50 transition-colors">
              {importing ? "Importando..." : `Importar ${activeRowsCount} filas × ${activeColsCount} columnas`}
            </button>
          </div>
        </div>
      )}

      {/* Paso 3: Resultado */}
      {step === "result" && result && (
        <div className="bg-white rounded-lg border border-surface-200 p-6 text-center">
          <svg className="w-10 h-10 mx-auto mb-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <h2 className="text-base font-semibold text-surface-800 mb-2">Importación completada</h2>
          <div className="flex justify-center gap-8 text-sm mb-4">
            <div><span className="text-2xl font-bold text-green-600">{result.created}</span><p className="text-surface-500">Creados</p></div>
            {result.updated > 0 && <div><span className="text-2xl font-bold text-blue-600">{result.updated}</span><p className="text-surface-500">Actualizados</p></div>}
            <div><span className="text-2xl font-bold text-yellow-600">{result.skipped}</span><p className="text-surface-500">Omitidos</p></div>
            <div><span className="text-2xl font-bold text-surface-400">{result.total}</span><p className="text-surface-500">Total</p></div>
          </div>
          {result.errors?.length > 0 && !result.duplicates?.length && (
            <div className="text-left bg-red-50 rounded-lg p-3 mb-4 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-red-700 mb-1">Errores:</p>
              {result.errors.map((e: string, i: number) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
          {/* Detalle de duplicados */}
          {result.duplicates?.length > 0 && (
            <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm font-semibold text-amber-800 mb-3">
                {result.duplicates.length} serial{result.duplicates.length > 1 ? "es" : ""} duplicado{result.duplicates.length > 1 ? "s" : ""}
                {result.updated > 0
                  ? <span className="text-blue-700"> — {result.updated} actualizado{result.updated > 1 ? "s" : ""}</span>
                  : <span className="text-surface-500"> (omitidos — activá &quot;Actualizar existentes&quot; para sobreescribir)</span>
                }
              </p>
              {result.duplicates.map((dup: any, idx: number) => {
                const FIELD_LABELS: Record<string, string> = { nombre: "Equipo", modelo: "Modelo", estado: "Estado", ubicacion: "Ubicación", fecha: "Fecha", notas: "Notas", marca: "Marca", categoria: "Categoría", asignado: "Asignado" };
                const wasUpdated = result.updated > 0;
                return (
                  <div key={idx} className={`mb-4 last:mb-0 rounded-lg border p-3 ${wasUpdated ? "bg-blue-50 border-blue-200" : "bg-white border-amber-100"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${wasUpdated ? "text-blue-700 bg-blue-100" : "text-amber-700 bg-amber-100"}`}>Fila {dup.fila}</span>
                      <span className="text-xs font-mono text-surface-600">Serial: <b>{dup.serial}</b></span>
                      {wasUpdated && <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">ACTUALIZADO</span>}
                    </div>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-left">
                          <th className="py-1 px-2 text-surface-500 font-medium w-24">Campo</th>
                          <th className="py-1 px-2 text-surface-500 font-medium">Excel (nuevo)</th>
                          <th className="py-1 px-2 text-surface-500 font-medium">BD {wasUpdated ? "(anterior)" : "(existente)"}</th>
                          <th className="py-1 px-2 text-surface-500 font-medium w-20">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...dup.diferentes, ...dup.iguales].map((field: string) => {
                          const isDiff = dup.diferentes.includes(field);
                          const newVal = dup.nuevo[field] || "—";
                          const oldVal = dup.existente[field] || "—";
                          return (
                            <tr key={field} className={isDiff ? (wasUpdated ? "bg-blue-100/50" : "bg-red-50") : ""}>
                              <td className="py-1 px-2 font-medium text-surface-700">{FIELD_LABELS[field] || field}</td>
                              <td className={`py-1 px-2 ${isDiff ? (wasUpdated ? "text-blue-700 font-semibold" : "text-red-700 font-semibold") : "text-surface-600"}`}>{newVal}</td>
                              <td className={`py-1 px-2 ${isDiff ? "text-surface-400 line-through" : "text-surface-600"}`}>{oldVal}</td>
                              <td className="py-1 px-2">
                                {isDiff
                                  ? wasUpdated
                                    ? <span className="text-blue-600 font-medium">Actualizado</span>
                                    : <span className="text-red-600 font-medium">Diferente</span>
                                  : <span className="text-green-600 font-medium">Igual</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {result.errors?.filter((e: string) => !e.includes("serie duplicado")).length > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <p className="text-xs font-medium text-red-700 mb-1">Otros errores:</p>
                  {result.errors.filter((e: string) => !e.includes("serie duplicado")).map((e: string, i: number) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                </div>
              )}
            </div>
          )}
          <button onClick={reset} className="px-6 py-2 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700">Nueva importación</button>
        </div>
      )}
    </div>
  );
}
