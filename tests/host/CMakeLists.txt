# Teste automático do Stillpoint no Linux (o app só roda no Windows e no Mac): o app inteiro, sem câmeras e sem
# janela; a página é servida por HTTP (webview/webview.h) e um Chromium sem tela a usa (run_tests.py), com um
# Lightroom de mentira (fake_lightroom.py) respondendo pelos mesmos arquivos do plugin.
#   cmake -S tests/host -B build/host-test -DCMAKE_BUILD_TYPE=Release
#   cmake --build build/host-test -j
#   python3 tests/host/run_tests.py
cmake_minimum_required(VERSION 3.24)
project(StillpointHostTest LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
include(FetchContent)
get_filename_component(STILLPOINT_SOURCE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
file(READ "${STILLPOINT_SOURCE_ROOT}/VERSION" STILLPOINT_VERSION)
string(STRIP "${STILLPOINT_VERSION}" STILLPOINT_VERSION)

FetchContent_Declare(stb GIT_REPOSITORY https://github.com/nothings/stb GIT_TAG 2c980bb59875b0d32144a71867fbdebb2f77cd20)
FetchContent_MakeAvailable(stb)
FetchContent_Declare(libraw_src GIT_REPOSITORY https://github.com/LibRaw/LibRaw GIT_TAG 0.21.4)
FetchContent_Declare(libraw_cmake GIT_REPOSITORY https://github.com/LibRaw/LibRaw-cmake
    GIT_TAG eb98e4325aef2ce85d2eb031c2ff18640ca616d3 SOURCE_SUBDIR stillpoint-do-not-add)
FetchContent_MakeAvailable(libraw_src libraw_cmake)
set(LIBRAW_PATH "${libraw_src_SOURCE_DIR}" CACHE STRING "" FORCE)
foreach(_opt ENABLE_OPENMP ENABLE_LCMS ENABLE_JASPER ENABLE_EXAMPLES ENABLE_RAWSPEED
             ENABLE_X3FTOOLS ENABLE_6BY9RPI LIBRAW_INSTALL LIBRAW_UNINSTALL_TARGET)
    set(${_opt} OFF CACHE BOOL "" FORCE)
endforeach()
set(CMAKE_DISABLE_FIND_PACKAGE_ZLIB TRUE)
set(CMAKE_DISABLE_FIND_PACKAGE_JPEG TRUE)
set(BUILD_SHARED_LIBS OFF)
set(CMAKE_POLICY_DEFAULT_CMP0077 NEW)
add_subdirectory("${libraw_cmake_SOURCE_DIR}" "${libraw_cmake_BINARY_DIR}" EXCLUDE_FROM_ALL)
unset(CMAKE_DISABLE_FIND_PACKAGE_ZLIB)
unset(CMAKE_DISABLE_FIND_PACKAGE_JPEG)
include("${STILLPOINT_SOURCE_ROOT}/cmake/export.cmake")

set(R "${STILLPOINT_SOURCE_ROOT}")
add_executable(StillpointHost
    ${R}/src/gui/main_gui.cpp
    ${R}/src/gui/camera_fleet.cpp
    ${R}/src/gui/auto_match.cpp
    ${R}/src/gui/match_debug.cpp
    ${R}/src/gui/chart.cpp
    ${R}/src/gui/project.cpp
    ${R}/src/gui/adobe.cpp
    ${R}/src/gui/native_window_stub.cpp
    ${R}/src/core/path_utils.cpp
    platform_linux_test.cpp
    stubs.cpp
)
# tests/host antes: o webview/webview.h daqui (sem janela) no lugar da biblioteca
target_include_directories(StillpointHost BEFORE PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}/edsdk_stub")
target_include_directories(StillpointHost PRIVATE ${R}/src/gui ${R}/include ${R}/src/core "${stb_SOURCE_DIR}")
target_compile_definitions(StillpointHost PRIVATE STILLPOINT_VERSION="${STILLPOINT_VERSION}" STILLPOINT_TEST_HOST=1)
target_link_libraries(StillpointHost PRIVATE stillpoint_export pthread)
