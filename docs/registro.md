# Estructura del número de registro

Analizado sobre los **83 570 registros de 9 dígitos** de la lista PDF (03-10-2026). La regla del dígito
verificador se cumple en el **100 %** de los casos.

```
 2  24  10211  7
 │  │   │      └── dígito verificador (módulo 11)
 │  │   └───────── secuencia de inscripción en esa gestión (00000-99999; en la práctica ≤ ~22 300)
 │  └───────────── gestión (año) de ingreso: 24 → 2024
 └──────────────── siglo: 2 → 2000+
```

## Dígito verificador
Pesos 2,3,4,5,6,7,8,9 sobre los 8 primeros dígitos (izquierda → derecha):

```
r = (d1·2 + d2·3 + d3·4 + d4·5 + d5·6 + d6·7 + d7·8 + d8·9) mod 11
verificador = r          si r ≤ 9
verificador = 1          si r = 10
```

Ejemplos: `224102117` → suma 62 → 62 mod 11 = 7 ✔ · `225019590` → 0 ✔

Consecuencias prácticas:
* Por cada secuencia existe **exactamente un** número válido: el scraper nunca prueba números imposibles.
* `common/registro.py` implementa `es_valido()`, `construir(gestion, secuencia)` y `candidatos_bloque()`.
* En SQL, `padron.fn_gestion_de_registro(registro)` deriva la gestión (columna generada `gestion_ingreso`).

## Distribución observada (PDF)
| Prefijo | Gestión | Registros en PDF | Secuencia máx. |
|---|---|---|---|
| 226 | 2026 | 15 734 | 22 246 |
| 225 | 2025 | 11 876 | 17 298 |
| 224 | 2024 | 10 480 | 16 926 |
| 223 | 2023 | 9 481 | 17 256 |
| 222 | 2022 | 8 030 | 17 503 |
| 221 | 2021 | 6 617 | 19 861 |
| 220 | 2020 | 4 717 | 17 618 |
| 210–219 | 2010–2019 | 14 387 | — |
| 200–209 | 2000–2009 | 2 008 | — |

* El 4.º dígito (primer dígito de la secuencia) es 0 o 1 (y 2 en 2026): las secuencias crecen a lo
  largo del año (inscripciones de ambos semestres), no codifican la facultad ni el semestre.
* Hay 122 registros antiguos de **7 dígitos** y algunos con prefijos 1xx/4xx/5xx/9xx (formatos
  históricos). Se cargan desde el PDF y se consultan en la web, pero no se enumeran.
* El prefijo `200` contiene registros dispersos en toda la secuencia (formato antiguo): el
  algoritmo los muestrea en lugar de expandirlos.
