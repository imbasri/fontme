# Product Requirements Document (PRD)
**Project Name:** fontKrea  
**Document Version:** 1.0  
**Target Platform:** Web (Desktop optimized)  
**Core Output:** `.gfont` (Trajectory Binary Font File)  , ttf,otf

## 1. Project Overview
GFont Creator adalah aplikasi berbasis web yang memungkinkan pengguna untuk merancang dan membuat font trajektori (single-line/stroke font) secara kustom melalui antarmuka kanvas interaktif. Berbeda dengan font vektor standar (.ttf/.otf), aplikasi ini secara spesifik mengekspor hasil akhirnya ke dalam format file `.gfont`. Format ini digunakan oleh perangkat keras seperti mesin CNC, *pen plotter*, dan *writing machine* untuk menggambar teks dengan goresan pena yang natural.

## 2. Tech Stack & Infrastructure
Aplikasi ini dikembangkan sepenuhnya menggunakan arsitektur **Full-stack Next.js**.

**Frontend (User Interface & Canvas):**
*   **Framework:** Next.js 16 (App Router)
*   **Language:** TypeScript (Strict Mode)
*   **UI/Styling:** Tailwind CSS & Shadcn UI v4
*   **State Management:** Zustand (untuk manajemen state kanvas, undo/redo, dan data *glyph*)
*   **Canvas Interaction:** HTML5 Canvas API dengan React Pointer Events (merekam koordinat X,Y presisi tinggi)
*   **Visual Smoothing:** `perfect-freehand` (Hanya untuk keperluan *render* visual yang mulus di layar, bukan untuk diekspor)

**Backend (Core Engine & File Generation):**
*   **Framework:** Next.js Route Handlers (`/api/...`) & Server Actions
*   **Binary Manipulation:** Node.js `Buffer` API (untuk manipulasi byte, float Big-Endian)
*   **Archiving:** `jszip` atau kompresor ZIP internal Node (membungkus setiap glyph codepoint)
*   **Encryption:** Implementasi kustom algoritma **TEA (Tiny Encryption Algorithm)** dalam TypeScript untuk mengenkripsi metadata/header `.gfont`.

**Database & Storage (Future Phase):**
*   **ORM/DB:** Drizzle ORM + PostgreSQL (untuk menyimpan profil, project, dan draft font pengguna).
*   **Storage:** S3 Compatible Storage (MinIO/AWS S3) untuk menyimpan *backup* file `.gfont`.

## 3. Core Features & Requirements

### 3.1. Workspace & Canvas Editor
*   **Grid & Guideline:** Kanvas harus memiliki panduan garis tepi (Baseline, x-height, Cap height, Descender).
*   **Trajectory Recording:** Sistem harus mampu mencatat setiap goresan *pointer* (mouse/stylus/touch) sebagai himpunan *array* dua dimensi `[x, y]` secara *real-time*.
*   **Stroke Management:** Dukungan fitur *undo, redo*, hapus *stroke* terakhir, dan *clear canvas*.
*   **Preview Mode:** Mode simulasi untuk melihat animasi penulisan trajektori sesuai urutan goresan pengguna.

### 3.2. Glyph Mapping & Management
*   **Unicode Mapping:** Pengguna dapat memetakan gambar di kanvas ke karakter/codepoint tertentu (misal: "A", "a", "1", "?").
*   **Character Grid View:** Dashboard (menggunakan komponen Shadcn) untuk melihat karakter mana saja yang sudah digambar dan mana yang masih kosong.

### 3.3. File Generation (.gfont Compiler)
*   **Payload Submission:** Mengirimkan *array* trajektori JSON ke Next.js API.
*   **Binary Structuring:** API akan menyusun data ke dalam spesifikasi biner `.gfont`:
    *   Tulis tipe data integer/float menggunakan Big-Endian.
    *   Bungkus data koordinat X,Y karakter ke dalam entri arsip ZIP dengan penamaan berupa angka desimal *codepoint*.
*   **TEA Encryption:** Melakukan enkripsi pada bagian metadata/header menggunakan algoritma TEA sesuai *key* spesifik format `.gfont`.
*   **Download Trigger:** Menghasilkan file bertipe `application/octet-stream` yang akan diproses *browser* sebagai unduhan otomatis dengan ekstensi `.gfont`.

## 4. System Architecture Flow
1. **User Input:** Pengguna menggambar huruf "A" di kanvas.
2. **Client Processing:** Zustand menyimpan array data trajektori `[{x: 10, y: 20}, {x: 12, y: 22}, ...]`.
3. **Export Action:** Pengguna menekan tombol "Export .gfont".
4. **API Request:** Frontend mengirimkan JSON berisi semua data trajektori yang telah digambar ke endpoint `/api/build-font`.
5. **Server Processing (Node.js):** 
    * Route handler mem-parsing JSON.
    * Mengubah koordinat menjadi byte array.
    * Memasukkan byte ke arsip ZIP virtual.
    * Membuat metadata terenkripsi (TEA).
    * Menggabungkan Header (TEA) + ZIP body ke dalam satu `Buffer`.
6. **Response:** API mengembalikan blob biner ke *client*.
7. **Client Download:** Browser memunculkan prompt *save file* `MyCustomFont.gfont`.

## 5. Development Milestones
*   **Phase 1: Proof of Concept (PoC)** 
    * Setup Next.js 16 + Tailwind + Shadcn v4.
    * Membuat UI Kanvas sederhana.
    * Berhasil merekam dan mengekstrak array (X,Y) dari satu karakter.
*   **Phase 2: Compiler Development**
    * Membangun *compiler script* di sisi backend (Node.js).
    * Mengimplementasikan enkripsi TEA dan integrasi *ZIP wrapping*.
    * Melakukan uji ekspor satu karakter `.gfont` dan mengetesnya di *software plotter* (misal: UUNA TEK).
*   **Phase 3: App Finalization**
    * Melengkapi UI/UX untuk *multi-glyph management* (semua alfabet).
    * Integrasi Zustand dan optimalisasi performa *render* kanvas.