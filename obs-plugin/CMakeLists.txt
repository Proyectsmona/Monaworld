cmake_minimum_required(VERSION 3.20)
project(monaworld_obs_plugin LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Configure OBS Studio's plugin SDK/toolchain before building.
# Example: cmake -S . -B build -DOBS_SOURCE_DIR=/path/to/obs-studio
add_library(monaworld MODULE src/plugin.cpp)
target_compile_definitions(monaworld PRIVATE MONAWORLD_PLUGIN_NAME=\"MonaWorld\")
