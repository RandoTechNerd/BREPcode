{
  "target_defaults": {
    "defines": [
      "NAPI_VERSION=8",
      "NAPI_CPP_EXCEPTIONS",
      "NDEBUG",
      "NOMINMAX",
      "SM_API_EXPORTS",
      "_HAS_EXCEPTIONS=1"
    ],
    "cflags_cc!": [
      "-fno-exceptions",
      "-fno-rtti",
      "-std=gnu++20",
      "-std=gnu++17"
    ],
    "cflags_cc": [
      "-std=c++17",
      "-fexceptions",
      "-frtti",
      "-O2",
      "-w",
      "-fPIC"
    ],
    "conditions": [
      [
        "OS=='win'",
        {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "RuntimeTypeInfo": "true",
              "AdditionalOptions": [
                "/GR",
                "/std:c++17",
                "/bigobj",
                "/MP",
                "/w",
                "/utf-8"
              ],
              "Optimization": 2,
              "LanguageStandard": "stdcpp17",
              "AdditionalOptions!": [
                "-std:c++20"
              ]
            }
          }
        }
      ],
      [
        "OS=='mac'",
        {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "GCC_ENABLE_CPP_RTTI": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "GCC_OPTIMIZATION_LEVEL": "2",
            "OTHER_CPLUSPLUSFLAGS": [
              "-fexceptions",
              "-frtti",
              "-w",
              "-Wno-deprecated"
            ]
          }
        }
      ]
    ],
    "configurations": {
      "Release": {
        "msvs_settings": {
          "VCCLCompilerTool": {
            "WholeProgramOptimization": "false",
            "RuntimeTypeInfo": "true",
            "ExceptionHandling": 1
          },
          "VCLinkerTool": {
            "LinkTimeCodeGeneration": 0
          },
          "VCLibrarianTool": {
            "AdditionalOptions!": [
              "/LTCG:INCREMENTAL",
              "/LTCG"
            ]
          }
        },
        "xcode_settings": {
          "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
          "GCC_ENABLE_CPP_RTTI": "YES",
          "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
          "MACOSX_DEPLOYMENT_TARGET": "11.0",
          "GCC_OPTIMIZATION_LEVEL": "2",
          "OTHER_CPLUSPLUSFLAGS": [
            "-fexceptions",
            "-frtti",
            "-w",
            "-Wno-deprecated"
          ]
        }
      }
    },
    "defines!": [
      "_HAS_EXCEPTIONS=0"
    ],
    "xcode_settings": {
      "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
      "GCC_ENABLE_CPP_RTTI": "YES",
      "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
      "MACOSX_DEPLOYMENT_TARGET": "11.0",
      "GCC_OPTIMIZATION_LEVEL": "2",
      "OTHER_CPLUSPLUSFLAGS": [
        "-fexceptions",
        "-frtti",
        "-w",
        "-Wno-deprecated"
      ]
    }
  },
  "targets": [
    {
      "target_name": "smlib",
      "type": "static_library",
      "sources": [
        "<!@(node list-sources.cjs SMLib)"
      ],
      "include_dirs": [
        "upstream/source/SMLib/inc"
      ]
    },
    {
      "target_name": "smapi",
      "type": "static_library",
      "sources": [
        "<!@(node list-sources.cjs SM_API)"
      ],
      "include_dirs": [
        "upstream/source/SM_API/inc",
        "upstream/source/SMLib/inc"
      ]
    },
    {
      "target_name": "brepcode_nvidia",
      "dependencies": [
        "smlib",
        "smapi"
      ],
      "sources": [
        "src/addon.cc"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "upstream/source/SM_API/inc",
        "upstream/source/SMLib/inc"
      ]
    }
  ]
}
