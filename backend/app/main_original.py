from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any
import math
import unicodedata

import joblib
import pandas as pd
import sklearn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# ============================================================
# CONFIGURACIÓN GENERAL
# ============================================================

app = FastAPI(
    title="Predicción Inmobiliaria de Beijing",
    description=(
        "API para estimar precio unitario por m², "
        "clasificar rotación y consultar el modelo temporal."
    ),
    version="1.3.0",
)

ORIGENES_PERMITIDOS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENES_PERMITIDOS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEBUG_ROTACION = True
DEBUG_PRECIO = True


# ============================================================
# RUTAS
# ============================================================

# Este archivo debe estar en:
# Datamining 2026/backend/app/main.py
BASE_DIR = Path(__file__).resolve().parents[2]
MODELS_DIR = BASE_DIR / "models_pkl"

RF_MODEL_PATH = MODELS_DIR / "pipeline_rf_precio_m2.pkl"
CLASSIFIER_MODEL_PATH = MODELS_DIR / "pipeline_rf_venta_rapida.pkl"

TEMPORAL_MODEL_CANDIDATES = [
    MODELS_DIR / "modelo_theta_precio_m2_ajuste_estacional.pkl",
    MODELS_DIR / "modelo_temporal_ganador_cv_pycaret.pkl",
    MODELS_DIR / "modelo_sarimax_precio_m2_completo.pkl",
]


# ============================================================
# CAMPOS CONOCIDOS DEL NEGOCIO
# ============================================================

CAMPOS_CATEGORICOS = (
    "tipo_edificio",
    "estado_renovacion",
    "estructura",
    "nombre_distrito",
    "nivel_piso",
)

CAMPOS_NUMERICOS_CONOCIDOS = {
    "longitud",
    "latitud",
    "precio_unitario_m2",
    "superficie_total",
    "cocina",
    "anio_construccion",
    "ascensor",
    "propiedad_cinco_anios",
    "metro",
    "dormitorios",
    "sala_estar",
    "banios",
    "numero_pisos",
    "anio_venta",
    "mes_venta",
    "trimestre_venta",
}

CLAVES_COLUMNAS_METADATA = (
    "feature_cols",
    "feature_columns",
    "columnas",
    "columnas_modelo",
    "features",
    "feature_names",
    "columnas_entrada",
)


# ============================================================
# CARGA DE MODELOS
# ============================================================

def cargar_archivo_joblib(
    ruta: Path,
    nombre: str,
) -> Any | None:
    try:
        objeto = joblib.load(ruta)

        print(
            f"[OK] {nombre} cargado desde: {ruta}\n"
            f"     tipo={type(objeto).__name__}\n"
            f"     scikit-learn={sklearn.__version__}"
        )

        return objeto

    except FileNotFoundError:
        print(f"[ERROR] No se encontró {nombre}: {ruta}")
        return None

    except Exception as exc:
        print(
            f"[ERROR] No se pudo cargar {nombre}: "
            f"{type(exc).__name__}: {exc}"
        )
        return None


def extraer_estimador(
    artefacto: Any,
    nombre: str,
) -> Any | None:
    """
    Admite un estimador directo o un diccionario con el
    estimador, métricas y metadatos.
    """
    if artefacto is None:
        return None

    if hasattr(artefacto, "predict"):
        print(
            f"[OK] {nombre}: estimador directo "
            f"({type(artefacto).__name__})."
        )
        return artefacto

    if not isinstance(artefacto, dict):
        print(
            f"[ERROR] {nombre}: tipo no compatible "
            f"({type(artefacto).__name__})."
        )
        return None

    claves_posibles = [
        "pipeline",
        "pipeline_final",
        "modelo",
        "model",
        "classifier",
        "clasificador",
        "modelo_final",
        "best_model",
        "estimador",
        "estimator",
    ]

    for clave in claves_posibles:
        candidato = artefacto.get(clave)

        if candidato is not None and hasattr(candidato, "predict"):
            print(
                f"[OK] {nombre}: estimador extraído "
                f"desde '{clave}' "
                f"({type(candidato).__name__})."
            )
            return candidato

    for clave, candidato in artefacto.items():
        if candidato is not None and hasattr(candidato, "predict"):
            print(
                f"[OK] {nombre}: estimador detectado "
                f"en '{clave}' "
                f"({type(candidato).__name__})."
            )
            return candidato

    print(
        f"[ERROR] {nombre}: no se encontró un objeto "
        f"con predict(). Claves: {list(artefacto.keys())}"
    )
    return None


def buscar_modelo_temporal() -> tuple[Path | None, Any | None]:
    for ruta in TEMPORAL_MODEL_CANDIDATES:
        if ruta.exists():
            return (
                ruta,
                cargar_archivo_joblib(ruta, "Modelo temporal"),
            )

    print("[ADVERTENCIA] No se encontró modelo temporal.")
    return None, None


rf_artifact = cargar_archivo_joblib(
    RF_MODEL_PATH,
    "Random Forest Regressor",
)
pipeline = extraer_estimador(
    rf_artifact,
    "Random Forest Regressor",
)

classifier_artifact = cargar_archivo_joblib(
    CLASSIFIER_MODEL_PATH,
    "Random Forest Classifier",
)
classifier = extraer_estimador(
    classifier_artifact,
    "Random Forest Classifier",
)

TEMPORAL_MODEL_PATH, temporal_artifact = buscar_modelo_temporal()


# ============================================================
# ESQUEMA DEL FORMULARIO
# ============================================================

class PropiedadInput(BaseModel):
    longitud: float
    latitud: float

    superficie_total: float = Field(..., gt=0)

    cocina: int = Field(..., ge=0)
    dormitorios: int = Field(..., ge=0)
    sala_estar: int = Field(..., ge=0)
    banios: int = Field(..., ge=0)

    # Se conserva en el formulario. Si un modelo no la espera,
    # preparar_entrada_modelo la ignora automáticamente.
    numero_pisos: int = Field(..., ge=1)

    anio_construccion: int = Field(..., ge=1800)

    metro: int = Field(..., ge=0, le=1)
    ascensor: int = Field(..., ge=0, le=1)
    propiedad_cinco_anios: int = Field(..., ge=0, le=1)

    tipo_edificio: str
    estado_renovacion: str
    estructura: str
    nombre_distrito: str
    nivel_piso: str


def current_sale_period() -> dict[str, int]:
    hoy = date.today()
    mes = hoy.month

    return {
        "anio_venta": hoy.year,
        "mes_venta": mes,
        "trimestre_venta": ((mes - 1) // 3) + 1,
    }


# ============================================================
# NOMBRES DE COLUMNAS DEL MODELO
# ============================================================

def obtener_columnas_desde_estimador(
    modelo: Any,
) -> list[str] | None:
    if modelo is None:
        return None

    if hasattr(modelo, "feature_names_in_"):
        return [
            str(columna)
            for columna in modelo.feature_names_in_
        ]

    if hasattr(modelo, "named_steps"):
        for paso in modelo.named_steps.values():
            columnas = obtener_columnas_desde_estimador(paso)
            if columnas:
                return columnas

    return None


def obtener_columnas_desde_artefacto(
    artefacto: Any,
) -> list[str] | None:
    if not isinstance(artefacto, dict):
        return None

    for clave in CLAVES_COLUMNAS_METADATA:
        valor = artefacto.get(clave)

        if isinstance(valor, (list, tuple, pd.Index)):
            return [str(columna) for columna in valor]

    return None


def obtener_columnas_modelo(
    modelo: Any,
    artefacto: Any = None,
) -> list[str] | None:
    columnas = obtener_columnas_desde_estimador(modelo)

    if columnas:
        return columnas

    return obtener_columnas_desde_artefacto(artefacto)


# ============================================================
# VALIDACIÓN DEL CONTRATO ENTRE MODELOS Y BACKEND
# ============================================================

def validar_contrato_modelos() -> list[str]:
    """
    Detecta errores de diseño antes de ejecutar predicciones.
    """
    advertencias: list[str] = []

    columnas_precio = obtener_columnas_modelo(
        pipeline,
        rf_artifact,
    ) or []

    columnas_rotacion = obtener_columnas_modelo(
        classifier,
        classifier_artifact,
    ) or []

    if pipeline is not None and not columnas_precio:
        advertencias.append(
            "El modelo de precio no conserva los nombres "
            "de sus columnas de entrada."
        )

    if classifier is not None and not columnas_rotacion:
        advertencias.append(
            "El clasificador no conserva los nombres "
            "de sus columnas de entrada."
        )

    # El regresor no debe usar como entrada la misma variable
    # que intenta predecir.
    if "precio_unitario_m2" in columnas_precio:
        advertencias.append(
            "CRÍTICO: el modelo de precio declara "
            "'precio_unitario_m2' como predictor. Revisa el "
            "entrenamiento porque esa es su variable objetivo."
        )

    # El clasificador encadenado sí debe recibir el precio
    # generado por el regresor.
    if classifier is not None and (
        "precio_unitario_m2" not in columnas_rotacion
    ):
        advertencias.append(
            "El clasificador no incluye precio_unitario_m2. "
            "El encadenamiento de modelos no tendrá efecto."
        )

    columnas_prohibidas = {
        "DEM",
        "DOM",
        "dem",
        "dom",
        "fecha_venta",
        "precio_venta",
        "precio_total",
        "interesados",
    }

    fugas_rotacion = sorted(
        set(columnas_rotacion)
        & columnas_prohibidas
    )

    if fugas_rotacion:
        advertencias.append(
            "Posible fuga de información en rotación: "
            + ", ".join(fugas_rotacion)
        )

    for mensaje in advertencias:
        print(f"[CONTRATO] {mensaje}")

    if not advertencias:
        print(
            "[CONTRATO] Modelos y backend compatibles."
        )

    return advertencias


ADVERTENCIAS_CONTRATO = validar_contrato_modelos()


# ============================================================
# PREPARACIÓN DE ENTRADAS
# ============================================================

def preparar_entrada_modelo(
    modelo: Any,
    datos_originales: dict[str, Any],
    artefacto: Any = None,
    nombre_modelo: str = "modelo",
) -> pd.DataFrame:
    """
    Adapta los datos del formulario a las columnas exactas
    utilizadas durante el entrenamiento.

    Regla importante:
    - Las variables numéricas obligatorias nunca se rellenan
      silenciosamente con cero.
    - Las columnas dummy no activadas sí se inicializan en cero.
    """
    if modelo is None:
        raise ValueError(
            f"El estimador de {nombre_modelo} no está disponible."
        )

    datos = dict(datos_originales)

    columnas_esperadas = obtener_columnas_modelo(
        modelo,
        artefacto,
    )

    if not columnas_esperadas:
        raise ValueError(
            f"{nombre_modelo} no conserva los nombres de "
            "sus columnas de entrada."
        )

    # Evita el error anterior de enviar cero silenciosamente
    # cuando faltaba precio_unitario_m2.
    numericas_faltantes = [
        columna
        for columna in columnas_esperadas
        if (
            columna in CAMPOS_NUMERICOS_CONOCIDOS
            and columna not in datos
        )
    ]

    if numericas_faltantes:
        raise ValueError(
            f"Faltan variables numéricas requeridas por "
            f"{nombre_modelo}: {numericas_faltantes}"
        )

    # Inicialización válida para columnas dummy.
    fila_modelo: dict[str, Any] = {
        columna: 0
        for columna in columnas_esperadas
    }

    # Coincidencias directas.
    for columna, valor in datos.items():
        if columna in fila_modelo:
            fila_modelo[columna] = valor

    categorias_no_reconocidas: list[str] = []

    for campo in CAMPOS_CATEGORICOS:
        categoria = datos.get(campo)

        if categoria is None:
            continue

        categoria = str(categoria).strip()
        reconocida = False

        # Caso 1: el Pipeline espera la categoría original.
        if campo in fila_modelo:
            fila_modelo[campo] = categoria
            reconocida = True

        # Caso 2: KNIME ya generó la dummy.
        if categoria in fila_modelo:
            fila_modelo[categoria] = 1
            reconocida = True

        if not reconocida:
            categorias_no_reconocidas.append(
                f"{campo}={categoria}"
            )

    if categorias_no_reconocidas:
        print(
            f"[ADVERTENCIA] {nombre_modelo}: categorías "
            "no reconocidas: "
            + ", ".join(categorias_no_reconocidas)
        )

    entrada = pd.DataFrame(
        [fila_modelo],
        columns=columnas_esperadas,
    )

    if entrada.isna().any().any():
        columnas_nan = entrada.columns[
            entrada.isna().any()
        ].tolist()

        raise ValueError(
            f"{nombre_modelo} recibió valores nulos en: "
            f"{columnas_nan}"
        )

    return entrada


# ============================================================
# FUNCIONES DE PRECIO
# ============================================================

def predecir_precio_unitario(
    datos_base: dict[str, Any],
) -> tuple[float, pd.DataFrame]:
    if pipeline is None:
        raise RuntimeError(
            "El modelo de precio no está disponible."
        )

    entrada_precio = preparar_entrada_modelo(
        modelo=pipeline,
        datos_originales=datos_base,
        artefacto=rf_artifact,
        nombre_modelo="modelo de precio",
    )

    prediccion = float(
        pipeline.predict(entrada_precio)[0]
    )

    if not math.isfinite(prediccion):
        raise ValueError(
            "El modelo de precio produjo un valor no finito."
        )

    if prediccion <= 0:
        raise ValueError(
            "El modelo de precio produjo un valor menor "
            "o igual que cero."
        )

    if DEBUG_PRECIO:
        activas = {
            columna: valor
            for columna, valor
            in entrada_precio.iloc[0].items()
            if (
                valor not in (0, 0.0, "0", None, "")
                and not pd.isna(valor)
            )
        }

        print("\n" + "=" * 72)
        print("DEPURACIÓN DEL MODELO DE PRECIO")
        print("=" * 72)
        print(f"Columnas esperadas: {list(entrada_precio.columns)}")
        print(f"Variables activas: {activas}")
        print(f"Precio estimado: {prediccion:.2f}")
        print("=" * 72 + "\n")

    return prediccion, entrada_precio


# ============================================================
# CLASES Y PROBABILIDADES DE ROTACIÓN
# ============================================================

def normalizar_texto(valor: Any) -> str:
    texto = str(valor).strip().casefold()

    return "".join(
        caracter
        for caracter in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caracter)
    )


def es_clase_rapida(valor: Any) -> bool:
    if isinstance(valor, bool):
        return bool(valor)

    if isinstance(valor, (int, float)):
        try:
            return float(valor) == 1.0
        except Exception:
            pass

    texto = normalizar_texto(valor)

    if texto in {"1", "1.0", "true", "si"}:
        return True

    if texto in {"0", "0.0", "false", "no"}:
        return False

    if "lenta" in texto or "desfavorable" in texto:
        return False

    return "rapida" in texto or "favorable" in texto


def etiqueta_negocio_rotacion(
    clase_original: Any,
) -> str:
    if es_clase_rapida(clase_original):
        return "Rápida (≤ 15 días)"

    return "Lenta (> 15 días)"


def obtener_clases_modelo(
    modelo: Any,
) -> list[Any]:
    if modelo is None:
        return []

    if hasattr(modelo, "classes_"):
        return list(modelo.classes_)

    if hasattr(modelo, "named_steps"):
        for paso in reversed(
            list(modelo.named_steps.values())
        ):
            if hasattr(paso, "classes_"):
                return list(paso.classes_)

    return []


def identificar_clases_rotacion(
    modelo: Any,
    artefacto: Any,
) -> tuple[Any, Any]:
    """
    Prioriza las etiquetas guardadas dentro del artefacto.
    """
    clases = obtener_clases_modelo(modelo)

    if len(clases) != 2:
        raise RuntimeError(
            f"Se esperaban dos clases y se obtuvieron: {clases}"
        )

    clase_lenta = None
    clase_rapida = None

    if isinstance(artefacto, dict):
        clase_lenta = artefacto.get("clase_lenta")
        clase_rapida = artefacto.get("clase_rapida")

    for clase in clases:
        if clase_lenta is None and not es_clase_rapida(clase):
            clase_lenta = clase

        if clase_rapida is None and es_clase_rapida(clase):
            clase_rapida = clase

    if clase_lenta not in clases or clase_rapida not in clases:
        raise RuntimeError(
            "No fue posible identificar las clases Lenta y Rápida. "
            f"classes_={clases}"
        )

    return clase_lenta, clase_rapida


def interpretar_probabilidades_rotacion(
    modelo: Any,
    probabilidades: Any,
) -> dict[str, Any]:
    clases = obtener_clases_modelo(modelo)

    probs = [
        float(probabilidad)
        for probabilidad in probabilidades
    ]

    if len(clases) != len(probs):
        raise RuntimeError(
            "La cantidad de clases no coincide con "
            "predict_proba()."
        )

    por_clase = {
        str(clase): probabilidad
        for clase, probabilidad
        in zip(clases, probs)
    }

    clase_lenta, clase_rapida = identificar_clases_rotacion(
        modelo,
        classifier_artifact,
    )

    indice_lenta = clases.index(clase_lenta)
    indice_rapida = clases.index(clase_rapida)

    return {
        "clases": [str(clase) for clase in clases],
        "probabilidades_por_clase": por_clase,
        "clase_lenta": clase_lenta,
        "clase_rapida": clase_rapida,
        "probabilidad_lenta": probs[indice_lenta],
        "probabilidad_rapida": probs[indice_rapida],
    }


def obtener_umbral_lenta() -> float:
    if isinstance(classifier_artifact, dict):
        valor = classifier_artifact.get(
            "umbral_lenta",
            0.50,
        )

        try:
            umbral = float(valor)
        except Exception:
            umbral = 0.50
    else:
        umbral = 0.50

    if not 0.0 < umbral < 1.0:
        print(
            f"[ADVERTENCIA] Umbral Lenta inválido: {umbral}. "
            "Se utilizará 0.50."
        )
        return 0.50

    return umbral


def imprimir_debug_rotacion(
    entrada: pd.DataFrame,
    precio_estimado: float,
    clase_predicha: Any,
    prob_rapida: float,
    prob_lenta: float,
    umbral_lenta: float,
) -> None:
    if not DEBUG_ROTACION:
        return

    activas = {
        columna: valor
        for columna, valor in entrada.iloc[0].items()
        if (
            valor not in (0, 0.0, "0", None, "")
            and not pd.isna(valor)
        )
    }

    print("\n" + "=" * 72)
    print("DEPURACIÓN DEL MODELO DE ROTACIÓN")
    print("=" * 72)
    print(f"Precio estimado recibido: {precio_estimado:.2f}")
    print(f"Clases: {obtener_clases_modelo(classifier)}")
    print(f"P(Rápida): {prob_rapida:.6f}")
    print(f"P(Lenta): {prob_lenta:.6f}")
    print(f"Umbral Lenta: {umbral_lenta:.6f}")
    print(f"Clase final: {clase_predicha}")
    print(f"Variables activas: {activas}")
    print("=" * 72 + "\n")


# ============================================================
# ENDPOINTS GENERALES
# ============================================================

@app.get("/")
def root():
    return {
        "proyecto": "Predicción inmobiliaria Beijing",
        "documentacion": "/docs",
        "estado": "/health",
        "modelos": "/model/info",
        "contrato": "/debug/models/contract",
    }


@app.get("/health")
def health_check():
    return {
        "status": (
            "ok"
            if pipeline is not None and classifier is not None
            else "degraded"
        ),
        "scikit_learn_version": sklearn.__version__,
        "modelo_precio_cargado": pipeline is not None,
        "modelo_rotacion_cargado": classifier is not None,
        "modelo_temporal_cargado": temporal_artifact is not None,
        "advertencias_contrato": ADVERTENCIAS_CONTRATO,
        "ruta_modelo_precio": str(RF_MODEL_PATH),
        "ruta_modelo_rotacion": str(CLASSIFIER_MODEL_PATH),
        "ruta_modelo_temporal": (
            str(TEMPORAL_MODEL_PATH)
            if TEMPORAL_MODEL_PATH
            else None
        ),
    }


@app.get("/model/info")
def model_info():
    columnas_precio = obtener_columnas_modelo(
        pipeline,
        rf_artifact,
    ) or []

    columnas_rotacion = obtener_columnas_modelo(
        classifier,
        classifier_artifact,
    ) or []

    return {
        "regresion": {
            "algoritmo": "Random Forest Regressor",
            "variable_objetivo": "precio_unitario_m2",
            "modelo_cargado": pipeline is not None,
            "columnas_esperadas": columnas_precio,
        },
        "clasificacion": {
            "algoritmo": "Random Forest Classifier",
            "variable_objetivo": "venta_rapida",
            "modelo_cargado": classifier is not None,
            "columnas_esperadas": columnas_rotacion,
            "usa_precio_estimado": (
                "precio_unitario_m2" in columnas_rotacion
            ),
            "umbral_lenta": obtener_umbral_lenta(),
            "clases_originales": [
                str(clase)
                for clase in obtener_clases_modelo(classifier)
            ],
        },
    }


@app.get("/debug/models/contract")
def debug_models_contract():
    return {
        "precio": {
            "archivo": str(RF_MODEL_PATH),
            "tipo_artefacto": (
                type(rf_artifact).__name__
                if rf_artifact is not None
                else None
            ),
            "tipo_estimador": (
                type(pipeline).__name__
                if pipeline is not None
                else None
            ),
            "columnas": obtener_columnas_modelo(
                pipeline,
                rf_artifact,
            ) or [],
        },
        "rotacion": {
            "archivo": str(CLASSIFIER_MODEL_PATH),
            "tipo_artefacto": (
                type(classifier_artifact).__name__
                if classifier_artifact is not None
                else None
            ),
            "tipo_estimador": (
                type(classifier).__name__
                if classifier is not None
                else None
            ),
            "columnas": obtener_columnas_modelo(
                classifier,
                classifier_artifact,
            ) or [],
            "precio_estimado_requerido": (
                "precio_unitario_m2"
                in (
                    obtener_columnas_modelo(
                        classifier,
                        classifier_artifact,
                    ) or []
                )
            ),
            "umbral_lenta": obtener_umbral_lenta(),
        },
        "advertencias": ADVERTENCIAS_CONTRATO,
    }


# ============================================================
# ENDPOINT DE PRECIO
# ============================================================

@app.post("/predict/individual")
def predict_individual(
    propiedad: PropiedadInput,
):
    try:
        datos = propiedad.model_dump()
        datos.update(current_sale_period())

        precio, _ = predecir_precio_unitario(datos)

        return {
            "modelo": "Random Forest Regression",
            "variable_objetivo": "precio_unitario_m2",
            "precio_unitario_m2_predicho": round(precio, 2),
            "unidad": "Yuan por metro cuadrado",
            "anio_venta_utilizado": datos["anio_venta"],
            "mensaje": "Predicción generada correctamente",
        }

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Error durante la predicción de precio: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc


# ============================================================
# ENDPOINT DE ROTACIÓN ENCADENADA
# ============================================================

@app.post("/predict/rotation")
def predict_rotation(
    propiedad: PropiedadInput,
):
    if classifier is None:
        raise HTTPException(
            status_code=500,
            detail=(
                "El modelo de rotación no está disponible. "
                f"Revisa: {CLASSIFIER_MODEL_PATH}"
            ),
        )

    try:
        datos_base = propiedad.model_dump()
        datos_base.update(current_sale_period())

        # 1. El primer modelo estima el precio unitario.
        precio_estimado, _ = predecir_precio_unitario(
            datos_base
        )

        # 2. El precio estimado se agrega como predictor
        #    del clasificador.
        datos_rotacion = dict(datos_base)
        datos_rotacion["precio_unitario_m2"] = (
            precio_estimado
        )

        entrada_rotacion = preparar_entrada_modelo(
            modelo=classifier,
            datos_originales=datos_rotacion,
            artefacto=classifier_artifact,
            nombre_modelo="modelo de rotación",
        )

        if not hasattr(classifier, "predict_proba"):
            raise AttributeError(
                "El clasificador no posee predict_proba()."
            )

        probabilidades = classifier.predict_proba(
            entrada_rotacion
        )[0]

        resultado = interpretar_probabilidades_rotacion(
            classifier,
            probabilidades,
        )

        prob_lenta = float(
            resultado["probabilidad_lenta"]
        )
        prob_rapida = float(
            resultado["probabilidad_rapida"]
        )

        clase_lenta = resultado["clase_lenta"]
        clase_rapida = resultado["clase_rapida"]

        # 3. Usa el umbral guardado durante Validation.
        #    Si el modelo antiguo no lo tiene, utiliza 0.50.
        umbral_lenta = obtener_umbral_lenta()

        clase_final = (
            clase_lenta
            if prob_lenta >= umbral_lenta
            else clase_rapida
        )

        confianza = (
            prob_lenta
            if clase_final == clase_lenta
            else prob_rapida
        )

        imprimir_debug_rotacion(
            entrada=entrada_rotacion,
            precio_estimado=precio_estimado,
            clase_predicha=clase_final,
            prob_rapida=prob_rapida,
            prob_lenta=prob_lenta,
            umbral_lenta=umbral_lenta,
        )

        return {
            "modelo": "Random Forest Classifier",
            "modelo_precio_previo": (
                "Random Forest Regression"
            ),
            "variable_objetivo": "venta_rapida",
            "precio_unitario_m2_utilizado": round(
                precio_estimado,
                2,
            ),
            "origen_precio_unitario_m2": (
                "Estimado por el modelo de regresión"
            ),
            "anio_venta_utilizado": (
                datos_rotacion["anio_venta"]
            ),
            "clasificacion": (
                etiqueta_negocio_rotacion(clase_final)
            ),
            "clase_predicha_original": str(clase_final),
            "probabilidad_rapida": round(
                prob_rapida,
                6,
            ),
            "probabilidad_lenta": round(
                prob_lenta,
                6,
            ),
            "umbral_lenta_aplicado": round(
                umbral_lenta,
                6,
            ),
            "confianza_prediccion": round(
                confianza * 100,
                2,
            ),
            "mensaje": (
                "Predicción encadenada generada correctamente"
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Error durante la predicción encadenada "
                f"de rotación: {type(exc).__name__}: {exc}"
            ),
        ) from exc


# ============================================================
# ENDPOINT TEMPORAL
# ============================================================

@app.get("/forecast/precio-m2")
def forecast_precio_m2(
    steps: int = 6,
):
    """
    Conserva compatibilidad con el paquete SARIMAX antiguo.
    El paquete Theta puede utilizar otra estructura.
    """
    if temporal_artifact is None:
        raise HTTPException(
            status_code=500,
            detail="No existe un modelo temporal disponible.",
        )

    if steps <= 0:
        raise HTTPException(
            status_code=400,
            detail="steps debe ser mayor que cero.",
        )

    if not isinstance(temporal_artifact, dict):
        raise HTTPException(
            status_code=501,
            detail=(
                "El artefacto temporal no es un diccionario "
                "compatible."
            ),
        )

    modelo = temporal_artifact.get("modelo")
    exog_futura = temporal_artifact.get(
        "exog_futura_usada"
    )

    if (
        modelo is None
        or not hasattr(modelo, "get_forecast")
        or exog_futura is None
    ):
        raise HTTPException(
            status_code=501,
            detail=(
                "El artefacto temporal no corresponde al "
                "formato SARIMAX esperado. Claves: "
                f"{list(temporal_artifact.keys())}"
            ),
        )

    try:
        exog_futura = exog_futura.head(steps)

        forecast_obj = modelo.get_forecast(
            steps=len(exog_futura),
            exog=exog_futura,
        )

        forecast = forecast_obj.predicted_mean
        intervalos = forecast_obj.conf_int()

        salida = []

        for indice in range(len(forecast)):
            fecha = forecast.index[indice]

            salida.append({
                "fecha_mes": (
                    str(fecha.date())
                    if hasattr(fecha, "date")
                    else str(fecha)
                ),
                "precio_m2_predicho": round(
                    float(forecast.iloc[indice]),
                    2,
                ),
                "limite_inferior": round(
                    float(intervalos.iloc[indice, 0]),
                    2,
                ),
                "limite_superior": round(
                    float(intervalos.iloc[indice, 1]),
                    2,
                ),
                "cantidad_ventas_usada": round(
                    float(exog_futura.iloc[indice, 0]),
                    2,
                ),
            })

        return {
            "modelo": temporal_artifact.get(
                "modelo_temporal",
                "SARIMAX",
            ),
            "unidad": "Yuan por metro cuadrado",
            "forecast": salida,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Error durante el pronóstico temporal: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc