import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
import joblib
import numpy as np

def train_classifier():
    print("Cargando dataset...")
    df = pd.read_csv('../data/dataset_limpio.csv')

    # Features y Target
    target = 'venta_rapida'
    
    cat_columns = ['tipo_edificio', 'estado_renovacion', 'estructura', 'nombre_distrito', 'nivel_piso']
    num_columns = ['longitud', 'latitud', 'superficie_total', 'cocina', 'dormitorios', 
                   'sala_estar', 'banios', 'numero_pisos', 'anio_construccion',
                   'anio_venta', 'mes_venta', 'trimestre_venta',
                   'metro', 'ascensor', 'propiedad_cinco_anios']

    X = df[num_columns + cat_columns]
    y = df[target]

    # Split: 60% Train, 20% Validation, 20% Test
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.4, random_state=42, stratify=y)
    X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.5, random_state=42, stratify=y_temp)

    print(f"Train: {len(X_train)}, Validation: {len(X_val)}, Test: {len(X_test)}")
    print(f"Class distribution in target: {y.value_counts().to_dict()}")

    print("Construyendo Pipeline...")
    # Preprocesamiento
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), num_columns),
            ('cat', OneHotEncoder(handle_unknown='ignore'), cat_columns)
        ])

    # Pipeline completo
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('model', RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1, class_weight='balanced'))
    ])

    print("Entrenando modelo (esto puede tomar un minuto)...")
    pipeline.fit(X_train, y_train)

    # Evaluación
    y_val_pred = pipeline.predict(X_val)
    y_test_pred = pipeline.predict(X_test)

    print(f"\n--- Métricas de Validación ---")
    print(f"Accuracy: {accuracy_score(y_val, y_val_pred):.4f}")
    print(f"Precision: {precision_score(y_val, y_val_pred):.4f}")
    print(f"Recall: {recall_score(y_val, y_val_pred):.4f}")
    print(f"F1 Macro: {f1_score(y_val, y_val_pred, average='macro'):.4f}")
    print(f"Matriz de confusión:\n{confusion_matrix(y_val, y_val_pred)}")

    print(f"\n--- Métricas de Prueba ---")
    print(f"Accuracy: {accuracy_score(y_test, y_test_pred):.4f}")
    print(f"Precision: {precision_score(y_test, y_test_pred):.4f}")
    print(f"Recall: {recall_score(y_test, y_test_pred):.4f}")
    print(f"F1 Macro: {f1_score(y_test, y_test_pred, average='macro'):.4f}")
    print(f"Matriz de confusión:\n{confusion_matrix(y_test, y_test_pred)}")

    # Guardar Pipeline
    joblib.dump(pipeline, '../models_pkl/classifier_rf_venta_rapida.pkl')
    print("\nModelo de clasificación guardado correctamente en 'models_pkl/classifier_rf_venta_rapida.pkl'")

if __name__ == "__main__":
    train_classifier()
