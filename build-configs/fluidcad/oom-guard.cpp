// build-configs/fluidcad/oom-guard.cpp — out-of-memory guard (link-time wrap of
// OCCT's unchecked allocator), compiled into the main build through
// `mainBuild.additionalBindFiles` in fluidcad_multi.yml.
//
// OCCT V8 in its default NATIVE memory-manager mode (USE_MMGR_TYPE=NATIVE, what
// the image's CMake step builds) implements `Standard::AllocateOptimal` as a bare
// `return malloc(theSize);` — no NULL check — while `Standard::Allocate` and
// `Standard::Reallocate` throw `Standard_OutOfMemory`. AllocateOptimal is the
// back end of `NCollection_Allocator`, i.e. every NCollection_Array1 / Vector /
// List / Map buffer and most of OCCT's heap traffic; `Standard::AllocateAligned`
// (`posix_memalign` branch) has the same gap. When the wasm heap reaches
// -sMAXIMUM_MEMORY, mimalloc correctly returns NULL (verified with a probe in the
// build image), the container keeps a null buffer, and the next SetValue() writes
// land at address 0 + offset: the data segment / stack / runtime tables are
// silently overwritten and the kernel dies later with "Maximum call stack size
// exceeded", "memory access out of bounds", "null function or function signature
// mismatch" or a hang — never with an OOM error.
//
// `-Wl,--wrap=<mangled>` (see emccFlags) redirects every reference to those two
// functions — from the OCCT static archives and from the Embind objects alike,
// all of which instantiate the inline allocator — to the `__wrap_` definitions
// below. They call the real function (`__real_`) and throw `Standard_OutOfMemory`
// on NULL, the exception OCCT itself documents for this case: it reaches JS as an
// ordinary OCCT `WebAssembly.Exception` (decode with `getExceptionMessage`), and
// when the allocation fails on a pthread worker it goes through OSD_ThreadPool's
// per-job failure capture and is re-thrown on the calling thread.
// `Standard_OutOfMemory` keeps its message in an inline buffer, so building and
// throwing it needs no heap.
//
// Why not the alternatives: `-sABORTING_MALLOC=1` only acts inside
// emscripten_resize_heap, and near the 4 GiB cap the failing request overflows the
// 32-bit brk pointer, so sbrk fails before any growth call and nothing aborts
// (verified); and patching Standard.cxx needs a full OCCT rebuild of the image,
// whereas the wrap only needs a relink. The mangled names are wasm32
// (`size_t` = `unsigned long` = `m`); check with
// `llvm-nm build/occt-cmake/lin32/clang/lib/libTKernel.a | grep Standard15Allocate`.

#include <Standard_OutOfMemory.hxx>
#include <cstddef>

// Standard::AllocateOptimal(const size_t)
void* ocjs_real_AllocateOptimal(std::size_t) __asm__("__real__ZN8Standard15AllocateOptimalEm");
void* ocjs_wrap_AllocateOptimal(std::size_t) __asm__("__wrap__ZN8Standard15AllocateOptimalEm");
void* ocjs_wrap_AllocateOptimal(std::size_t theSize) {
  void* aPtr = ocjs_real_AllocateOptimal(theSize);
  if (aPtr == nullptr) {
    throw Standard_OutOfMemory("Standard::AllocateOptimal(): malloc failed - wasm heap exhausted (out of memory)");
  }
  return aPtr;
}

// Standard::AllocateAligned(const size_t, const size_t)
void* ocjs_real_AllocateAligned(std::size_t, std::size_t) __asm__("__real__ZN8Standard15AllocateAlignedEmm");
void* ocjs_wrap_AllocateAligned(std::size_t, std::size_t) __asm__("__wrap__ZN8Standard15AllocateAlignedEmm");
void* ocjs_wrap_AllocateAligned(std::size_t theSize, std::size_t theAlign) {
  void* aPtr = ocjs_real_AllocateAligned(theSize, theAlign);
  if (aPtr == nullptr) {
    throw Standard_OutOfMemory("Standard::AllocateAligned(): aligned alloc failed - wasm heap exhausted (out of memory)");
  }
  return aPtr;
}
