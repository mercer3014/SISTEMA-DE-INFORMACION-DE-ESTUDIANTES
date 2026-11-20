"""
Utilidades del número de registro.

Estructura descubierta (verificada sobre 83 570 registros de 9 dígitos de la lista PDF,
100 % de coincidencia):

    2 YY SSSSS D
    │ │  │     └─ dígito verificador
    │ │  └─────── secuencia de inscripción dentro de la gestión (00000–99999)
    │ └────────── año de ingreso (gestión): 24 -> 2024
    └──────────── siglo (2 = 2000+)

Dígito verificador: módulo 11 con pesos 2..9 sobre los 8 primeros dígitos,
de izquierda a derecha; si el resto es 10 el dígito es 1.

    224102117 -> 2·2+2·3+4·4+1·5+0·6+2·7+1·8+1·9 = 62 ; 62 mod 11 = 7 ✔
"""
from __future__ import annotations

PESOS = (2, 3, 4, 5, 6, 7, 8, 9)


def digito_verificador(base8: str) -> int:
    if len(base8) != 8 or not base8.isdigit():
        raise ValueError(f"se esperaban 8 dígitos: {base8!r}")
    r = sum(int(d) * w for d, w in zip(base8, PESOS)) % 11
    return 1 if r == 10 else r


def construir(gestion: int, secuencia: int) -> str:
    """gestion=2024, secuencia=10211 -> '224102117'"""
    if not (2000 <= gestion <= 2099):
        raise ValueError("gestión fuera de rango (2000-2099)")
    base = f"2{gestion % 100:02d}{secuencia:05d}"
    return base + str(digito_verificador(base))


def es_valido(registro: str) -> bool:
    return (len(registro) == 9 and registro.isdigit()
            and int(registro[8]) == digito_verificador(registro[:8]))


def gestion(registro: str) -> int | None:
    if len(registro) == 9 and registro.isdigit() and registro[0] in "12":
        return (2000 if registro[0] == "2" else 1900) + int(registro[1:3])
    return None


def candidatos_bloque(bloque: str) -> list[str]:
    """Bloque = 6 primeros dígitos (2YY + 3 dígitos de secuencia) -> 100 registros válidos."""
    return [f"{bloque}{i:02d}" + str(digito_verificador(f"{bloque}{i:02d}")) for i in range(100)]
