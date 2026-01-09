# MaStR Data Relationships

The following diagrams illustrate the dependencies between entities in the Marktstammdatenregister (MaStR) data model, categorized by domain.

> [!NOTE]
> **Naming Convention**: The entity names in these diagrams match the exact keys found in `schema.json` (which correspond to the XML filenames in `bulk.zip`).

## Overview: Primary Dependencies

This high-level view shows the fundamental connections between Market Actors, Locations, Units, and the Grid.

```mermaid
erDiagram
    Marktakteure ||--o{ EinheitenSolar : operates
    Marktakteure ||--o{ Netzanschlusspunkte : manages
    Lokationen ||--o{ EinheitenSolar : "contains"
    Lokationen ||--o{ Netzanschlusspunkte : "connects to"
    Netzanschlusspunkte ||--|| Netze : "belongs to"
    EinheitenSolar ||--o| AnlagenEegSolar : "has EEG data"
    EinheitenAenderungNetzbetreiberzuordnungen }o--|| EinheitenSolar : "tracks changes for"

    EinheitenSolar {
        string EinheitMastrNummer PK
        string LokationMaStRNummer FK
        string AnlagenbetreiberMastrNummer FK
    }
    Lokationen {
        string MastrNummer PK
    }
    Marktakteure {
        string MastrNummer PK
    }
    Netzanschlusspunkte {
        string NetzanschlusspunktMastrNummer PK
        string LokationMaStRNummer FK
        string NetzMaStRNummer FK
        string NetzbetreiberMaStRNummer FK
    }
    Netze {
        string MastrNummer PK
    }
    AnlagenEegSolar {
        string EegMaStRNummer PK
    }
```

## 1. Core Infrastructure & Geography

This domain covers how physical units are anchored to geographic locations and the electrical grid.

```mermaid
erDiagram
    Lokationen ||--o{ EinheitenSolar : "contains"
    Lokationen ||--o{ Netzanschlusspunkte : "connects to"
    Netzanschlusspunkte ||--|| Netze : "belongs to"

    Lokationen {
        string MastrNummer PK
    }
    EinheitenSolar {
        string EinheitMastrNummer PK
        string LokationMaStRNummer FK
    }
    Netzanschlusspunkte {
        string NetzanschlusspunktMastrNummer PK
        string LokationMaStRNummer FK
        string NetzMaStRNummer FK
    }
    Netze {
        string MastrNummer PK
    }
```

## 2. Renewable Energy Units (EEG)

Renewable units consist of a technical "Einheit" entry and a corresponding "AnlageEeg" entry containing regulatory data. They are linked via their specific MaStR numbers.

```mermaid
erDiagram
    EinheitenSolar ||--o| AnlagenEegSolar : "has regulatory data"
    EinheitenWind ||--o| AnlagenEegWind : "has regulatory data"
    EinheitenBiomasse ||--o| AnlagenEegBiomasse : "has regulatory data"
    EinheitenWasser ||--o| AnlagenEegWasser : "has regulatory data"

    AnlagenEegSolar {
        string EegMaStRNummer PK
    }
```

## 3. Conventional Generation & Storage

This domain includes combined heat and power (KWK), combustion plants, and energy storage systems.

```mermaid
erDiagram
    EinheitenVerbrennung ||--o| AnlagenKwk : "may have KWK data"
    EinheitenStromSpeicher ||--o| AnlagenStromSpeicher : "specialized data"
    EinheitenGasSpeicher ||--o| AnlagenGasSpeicher : "specialized data"

    EinheitenStromSpeicher {
        string EinheitMastrNummer PK
    }
    AnlagenKwk {
        string KwkMaStRNummer PK
    }
```

## 4. Market Actors & Roles

Entities describing the organizations and roles (Operators, Grid Operators, etc.) in the market.

```mermaid
erDiagram
    Marktakteure ||--o{ MarktakteureUndRollen : "performs"
    Marktakteure ||--o{ EinheitenSolar : "operates"
    Marktakteure ||--o{ Lokationen : "owns"

    Marktakteure {
        string MastrNummer PK
    }
    MarktakteureUndRollen {
        string MastrNummer PK
        string Marktrolle FK
    }
```

### Key Relationships Explained

- **Units & Locations**: Every specific unit (e.g., `EinheitenSolar`, `EinheitenWind`) is physically tied to a Geographic Location (`LokationMaStRNummer`).
- **EEG & KWK Links**: Regulatory subsidies (EEG/KWK) are managed in separate entities (e.g., `AnlagenEegSolar`) linked to the unit.
- **Change Tracking**: `EinheitenAenderungNetzbetreiberzuordnungen` (previously referred to as "UNIT_CHANGES") tracks history and audit logs for unit assignments to grid operators.
- **Entity Identity**: All major objects use a `MastrNummer` (or variant like `EinheitMastrNummer`) as a unique identifier across the entire system.
