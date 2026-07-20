from pathlib import Path
import warnings

import joblib
import sklearn
from sklearn.exceptions import InconsistentVersionWarning


# ============================================================
# RUTAS
# ============================================================

ROOT_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT_DIR / "models_pkl"

modelos = [
    MODELS_DIR / "pipeline_rf_precio_m2.pkl",
    MODELS_DIR / "pipeline_rf_venta_rapida.pkl",
    MODELS_DIR / "modelo_theta_precio_m2_ajuste_estacional.pkl",
]


# ============================================================
# INFORMACIÓN DEL ENTORNO
# ============================================================

print("=" * 65)
print("VERIFICACIÓN DE MODELOS")
print("=" * 65)
print(f"Versión actual de scikit-learn: {sklearn.__version__}")
print(f"Carpeta de modelos: {MODELS_DIR}")
print()


# Convertir las advertencias de incompatibilidad en excepciones
warnings.simplefilter(
    "error",
    InconsistentVersionWarning,
)


# ============================================================
# VERIFICAR CADA MODELO
# ============================================================

for ruta in modelos:
    print(f"Revisando: {ruta.name}")

    if not ruta.exists():
        print(f"  El archivo no existe en: {ruta}")
        print()
        continue

    try:
        modelo = joblib.load(ruta)

        print("  El modelo se cargó sin advertencia de versión.")
        print(f"  Tipo de objeto: {type(modelo).__name__}")

        if hasattr(modelo, "feature_names_in_"):
            print(
                f"  Cantidad de variables esperadas: "
                f"{len(modelo.feature_names_in_)}"
            )

        elif hasattr(modelo, "named_steps"):
            print(
                f"  Pasos del pipeline: "
                f"{list(modelo.named_steps.keys())}"
            )

    except InconsistentVersionWarning as warning:
        print("  Incompatibilidad de scikit-learn detectada.")
        print(
            f"  Versión usada al entrenar: "
            f"{warning.original_sklearn_version}"
        )
        print(
            f"  Versión instalada ahora: "
            f"{warning.current_sklearn_version}"
        )

    except Exception as error:
        print(
            f"  Otro error: "
            f"{type(error).__name__}: {error}"
        )

    print()


print("=" * 65)
print("VERIFICACIÓN FINALIZADA")
print("=" * 65)