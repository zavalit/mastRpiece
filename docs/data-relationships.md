# MaStR Data Relationships

The following diagrams illustrate the dependencies between entities in the Marktstammdatenregister (MaStR) data model, categorized by domain.

## Overview: Primary Dependencies

This high-level view shows the fundamental connections between Market Actors, Locations, Units, and the Grid.

```mermaid
erDiagram
    MARKTAKTEUR ||--o{ EINHEIT : operates
    MARKTAKTEUR ||--o{ NETZANSCHLUSSPUNKT : manages
    LOKATION ||--o{ EINHEIT : "contains"
    LOKATION ||--o{ NETZANSCHLUSSPUNKT : "connects to"
    NETZANSCHLUSSPUNKT ||--|| NETZ : "belongs to"
    EINHEIT ||--o| ANLAGE_EEG : "has EEG data"

    EINHEIT {
        string EinheitMastrNummer PK
        string LokationMaStRNummer FK
        string AnlagenbetreiberMastrNummer FK
    }
    LOKATION {
        string MastrNummer PK
    }
    MARKTAKTEUR {
        string MastrNummer PK
    }
    NETZANSCHLUSSPUNKT {
        string NetzanschlusspunktMastrNummer PK
        string LokationMaStRNummer FK
        string NetzMaStRNummer FK
        string NetzbetreiberMaStRNummer FK
    }
    NETZ {
        string MastrNummer PK
    }
    ANLAGE_EEG {
        string EegMaStRNummer PK
    }
```

## 1. Core Infrastructure & Geography

This domain covers how physical units are anchored to geographic locations and the electrical grid.

```mermaid
erDiagram
    LOKATION ||--o{ EINHEIT : "contains"
    LOKATION ||--o{ NETZANSCHLUSSPUNKT : "connects to"
    NETZANSCHLUSSPUNKT ||--|| NETZ : "belongs to"

    LOKATION {
        string MastrNummer PK
    }
    EINHEIT {
        string EinheitMastrNummer PK
        string LokationMaStRNummer FK
    }
    NETZANSCHLUSSPUNKT {
        string NetzanschlusspunktMastrNummer PK
        string LokationMaStRNummer FK
        string NetzMaStRNummer FK
    }
    NETZ {
        string MastrNummer PK
    }
```

## 2. Renewable Energy Units (EEG)

Renewable units consist of a technical "Unit" entry and a corresponding "EEG-Anlage" entry containing regulatory data.

```mermaid
erDiagram
    EINHEIT ||--o| ANLAGE_EEG : "has regulatory data"

    EINHEIT ||--o| EINHEIT_SOLAR : "specialized as"
    EINHEIT ||--o| EINHEIT_WIND : "specialized as"
    EINHEIT ||--o| EINHEIT_BIOMASSE : "specialized as"
    EINHEIT ||--o| EINHEIT_WASSER : "specialized as"

    ANLAGE_EEG ||--o| ANLAGE_EEG_SOLAR : "specialized as"
    ANLAGE_EEG ||--o| ANLAGE_EEG_WIND : "specialized as"
    ANLAGE_EEG ||--o| ANLAGE_EEG_BIOMASSE : "specialized as"

    ANLAGE_EEG {
        string EegMaStRNummer PK
    }
```

## 3. Conventional Generation & Storage

This domain includes combined heat and power (KWK), combustion plants, and energy storage systems.

```mermaid
erDiagram
    EINHEIT ||--o| EINHEIT_KWK : "specialized as"
    EINHEIT ||--o| EINHEIT_VERBRENNUNG : "specialized as"
    EINHEIT ||--o| EINHEIT_STROM_SPEICHER : "specialized as"
    EINHEIT ||--o| EINHEIT_GAS_SPEICHER : "specialized as"

    EINHEIT_VERBRENNUNG ||--o| ANLAGE_KWK : "may have KWK data"

    EINHEIT_STROM_SPEICHER {
        string EinheitMastrNummer PK
    }
    ANLAGE_KWK {
        string KwkMaStRNummer PK
    }
```

## 4. Market Actors & Roles

Entities describing the organizations and roles (Operators, Grid Operators, etc.) in the market.

```mermaid
erDiagram
    MARKTAKTEUR ||--o{ MARKTAKTEUR_ROLLE : "performs"
    MARKTAKTEUR ||--o{ EINHEIT : "operates"
    MARKTAKTEUR ||--o{ LOKATION : "owns"

    MARKTAKTEUR {
        string MastrNummer PK
    }
    MARKTAKTEUR_ROLLE {
        string MastrNummer PK
        string Marktrolle FK
    }
```

### Key Relationships Explained

- **Units & Locations**: Every unit (Solar, Wind, etc.) is physically tied to a Geographic Location (`LokationMaStRNummer`).
- **EEG & KWK Links**: Regulatory subsidies (EEG/KWK) are often managed in separate lookup tables linked by their specific MaStR numbers.
- **Inheritance**: The schema uses a pseudo-inheritance model where common fields are in the base `Einheit` table and specific technical parameters are in type-specific tables.
