# Project Brief: Veeam Data Cloud Vault Sizer

## Overview
A professional, high-fidelity sizing utility designed for Veeam Systems Engineers (SEs) to showcase storage requirements for Veeam Data Cloud Vault to customers. The tool provides a clean, enterprise-grade interface for modeling backup infrastructure with both simplified and advanced configuration paths.

## Target Audience
- **Primary:** Veeam Systems Engineers (SEs).
- **Secondary:** IT Decision Makers and Customers.

## Key Requirements & Functional Scope

### 1. Dual-Mode Interface
- **Simple Mode:** A streamlined, card-based flow for quick estimations. Focuses on a single "pathway" (Direct to Vault or Backup Copy).
- **Advanced Mode:** A management-focused interface allowing for multiple repository definitions and granular backup job mapping.

### 2. Sizing Logic & Inputs
- **Workload Data:** Source Data Size (TB), Daily Change Rate (%), Data Reduction (Default 50%), Yearly Growth (%), Short-term Retention (Days), and GFS Points (W/M/Y).
- **Repository Types:** 
    - Vault Azure, Vault AWS, S3 Compatible, Azure Blob, AWS S3.
    - **SOBR (Scale-Out Backup Repository):** Requires multi-tier logic.
- **SOBR Tiering Rules:**
    - **Performance Tier:** Supports NAS, ReFS/XFS, Linux Hardened, S3 Compatible, AWS S3, Azure Blob, Vault Azure, Vault AWS.
    - **Capacity Tier:** Supports S3 Compatible, AWS S3, Azure Blob, Vault Azure, Vault AWS. Includes "Copy" and "Move" modes with offload periods.
    - **Archive Tier:** Supports Archive-specific cloud targets with GFS offloading.

### 3. Advanced Features
- **Repository Manager:** Define one or more complex storage targets (SOBR or standalone).
- **Job Builder:** A tabular view to create multiple backup jobs, each assigned to a specific repository.
- **Aggregate Projections:** Real-time calculation of Total Front-End Capacity vs. Required Back-End Storage, with breakdown by storage tier (Performance vs. Capacity/Archive).

## Visual Identity & Design Language
- **Theme:** Clean, modern enterprise utility.
- **Color Palette:** Veeam Green (#00B159) for primary actions and brand presence, high-contrast slate for typography, and light gray surfaces for depth.
- **Components:** Card-based layouts, segmented "pill" toggles for mode switching, and persistent summary sidebars.
- **Fidelity:** Professional-grade, suitable for direct customer presentation.

## Success Metrics
- Consistency in design language between Simple and Advanced modes.
- Accuracy in tier-based storage projection logic.
- Ease of use for rapid SE "on-the-fly" sizing.