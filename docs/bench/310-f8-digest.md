# Point 310 input: digest of the deposited F8 reports

Generated from the git-ignored local/ reports (weak desktop = calibration target; no re-run possible). Columns per row: ablation config, phase, frame/cpu/gpu medians, draw calls, triangles, the four largest systems.

## WEAK DESKTOP (calibration target) — webgpu, amd rdna-3, 2195x1235 dpr 1.75, build production 2b6b417
config | phase | frame med/p95 ms | cpu med | gpu med ms | draws | tris | top systems (tris/meshes)
baseline | savanna-standing | 55.9/59.3 | 14.40 | 45.22 | 960 | 3041997 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 647186/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
baseline | desert-standing | 78.7/83.0 | 13.80 | 68.35 | 930 | 1306436 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
baseline | savanna-driving | 76.3/80.4 | 14.70 | 65.93 | 962 | 3045376 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 642052/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
traa-off | savanna-standing | 53.3/62.9 | 16.40 | 40.11 | 959 | 3046659 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 647186/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
traa-off | desert-standing | 72.7/75.4 | 17.30 | 60.29 | 928 | 1306434 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
traa-off | savanna-driving | 69.1/73.9 | 18.20 | 56.69 | 968 | 3045566 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 642100/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
ssao-off | savanna-standing | 46.2/49.6 | 15.80 | 37.16 | 968 | 3046852 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 647234/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
ssao-off | desert-standing | 67.2/69.1 | 14.00 | 57.87 | 929 | 1306435 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
ssao-off | savanna-driving | 64.8/68.6 | 14.80 | 55.18 | 953 | 2996223 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 629764/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadows-off | savanna-standing | 53.6/55.1 | 7.40 | 46.33 | 70 | 983571 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 633242/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadows-off | desert-standing | 77.2/86.0 | 8.20 | 69.99 | 72 | 544052 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadows-off | savanna-driving | 74.2/82.4 | 7.90 | 66.85 | 75 | 1002352 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 629764/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadow-half | savanna-standing | 56.0/59.7 | 14.60 | 45.74 | 952 | 2987877 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 633242/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadow-half | desert-standing | 78.6/81.7 | 13.90 | 68.55 | 930 | 1306436 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadow-half | savanna-driving | 76.1/82.2 | 14.70 | 65.80 | 958 | 3033536 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 639092/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
post-off | savanna-standing | 40.2/72.7 | 11.90 | 27.53 | 953 | 3030154 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 644226/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
post-off | desert-standing | 60.1/112.9 | 11.50 | 50.07 | 927 | 1306433 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
post-off | savanna-driving | 44.9/104.9 | 21.20 | 44.83 | 959 | 3032093 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 638732/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
dpr-1 | savanna-standing | 23.0/26.2 | 21.50 | 16.32 | 961 | 3026757 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 642210/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
dpr-1 | desert-standing | 29.5/32.3 | 20.50 | 23.46 | 930 | 1306436 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
dpr-1 | savanna-driving | 29.8/34.1 | 26.40 | 21.23 | 962 | 3008336 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 632792/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-refine-off | savanna-standing | 54.4/56.3 | 24.00 | 43.84 | 961 | 2816981 | travel-dressing 637926/37; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-refine-off | desert-standing | 78.0/83.5 | 23.20 | 69.40 | 930 | 1152324 | (unnamed) MeshStandardNodeMaterial 425118/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-refine-off | savanna-driving | 75.6/83.6 | 26.40 | 65.21 | 954 | 2820608 | travel-dressing 638836/36; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-cap-84 | savanna-standing | 54.9/60.5 | 25.50 | 44.63 | 956 | 2936149 | (unnamed) MeshStandardNodeMaterial 779934/180; travel-dressing 648310/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-cap-84 | desert-standing | 78.9/85.4 | 22.70 | 68.29 | 930 | 1216836 | (unnamed) MeshStandardNodeMaterial 679134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-cap-84 | savanna-driving | 76.1/83.6 | 26.00 | 60.75 | 954 | 2884992 | (unnamed) MeshStandardNodeMaterial 775006/180; travel-dressing 632756/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
all-off | savanna-standing | 16.7/16.9 | 7.80 | 9.70 | 67 | 793920 | travel-dressing 637890/37; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
all-off | desert-standing | 17.0/33.8 | 9.40 | 15.86 | 69 | 389937 | (unnamed) MeshStandardNodeMaterial 425118/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
all-off | savanna-driving | 16.7/33.5 | 9.10 | 10.29 | 75 | 795157 | travel-dressing 634476/36; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
low-preset | savanna-standing | 16.7/17.0 | 5.20 | 8.65 | 58 | 687076 | travel-dressing 531058/37; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
low-preset | desert-standing | 16.7/33.7 | 7.70 | 14.81 | 55 | 245565 | (unnamed) MeshStandardNodeMaterial 425118/180; travel-dressing 64892/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
low-preset | savanna-driving | 16.7/33.1 | 6.80 | 9.63 | 62 | 691201 | travel-dressing 530532/36; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1

## GALAXY S25 (second target) — webgpu, qualcomm adreno-8xx, 804x325 dpr 2.625, build production 4f1d6f4
config | phase | frame med/p95 ms | cpu med | gpu med ms | draws | tris | top systems (tris/meshes)
baseline | savanna-standing | 16.7/19.8 | 13.10 | 12.58 | 977 | 3025069 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 628982/38; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
baseline | desert-standing | 18.8/21.2 | 11.30 | 16.65 | 943 | 1362060 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
baseline | savanna-driving | 21.8/39.1 | 13.90 | 18.55 | 975 | 3056872 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 629788/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
traa-off | savanna-standing | 18.3/19.3 | 12.40 | 16.38 | 972 | 3051831 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 634922/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
traa-off | desert-standing | 22.9/23.8 | 12.90 | 21.04 | 941 | 1362058 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
traa-off | savanna-driving | 23.4/25.9 | 13.50 | 17.96 | 965 | 3068870 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 632788/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
ssao-off | savanna-standing | 16.7/20.9 | 8.20 | 10.09 | 965 | 3058864 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 636266/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
ssao-off | desert-standing | 16.7/20.1 | 12.20 | 14.61 | 942 | 1362059 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
ssao-off | savanna-driving | 16.8/21.1 | 7.40 | 11.08 | 976 | 3142919 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 644804/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadows-off | savanna-standing | 16.7/17.0 | 8.10 | 11.53 | 77 | 1057431 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 649938/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadows-off | desert-standing | 18.2/19.6 | 7.00 | 16.71 | 76 | 599604 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadows-off | savanna-driving | 17.9/19.1 | 6.80 | 12.32 | 80 | 1088816 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 629764/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadow-half | savanna-standing | 16.6/20.5 | 9.00 | 14.02 | 966 | 3046769 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 633242/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadow-half | desert-standing | 20.9/21.6 | 11.70 | 18.55 | 943 | 1362060 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
shadow-half | savanna-driving | 21.5/23.4 | 12.10 | 18.55 | 967 | 3092552 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 638708/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
post-off | savanna-standing | 16.7/19.2 | 7.70 | 12.45 | 964 | 3085550 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 642186/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
post-off | desert-standing | 19.0/20.7 | 12.60 | 17.04 | 940 | 1362057 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
post-off | savanna-driving | 17.4/28.1 | 9.80 | 13.57 | 965 | 3082757 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 629764/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
dpr-1 | savanna-standing | 16.7/21.8 | 9.00 | 8.59 | 967 | 3049777 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 633242/37; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
dpr-1 | desert-standing | 16.6/20.0 | 9.20 | 8.98 | 943 | 1362060 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
dpr-1 | savanna-driving | 16.7/22.0 | 8.50 | 8.39 | 979 | 3094456 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 639184/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-refine-off | savanna-standing | 16.7/19.8 | 7.20 | 13.17 | 978 | 2853321 | travel-dressing 644318/37; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-refine-off | desert-standing | 19.6/20.7 | 11.40 | 17.24 | 943 | 1169420 | (unnamed) MeshStandardNodeMaterial 425118/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-refine-off | savanna-driving | 19.6/23.4 | 9.80 | 13.89 | 967 | 2836936 | travel-dressing 638644/36; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-cap-84 | savanna-standing | 16.6/17.7 | 8.60 | 13.63 | 969 | 2956901 | (unnamed) MeshStandardNodeMaterial 779934/180; travel-dressing 645126/38; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-cap-84 | desert-standing | 23.1/25.8 | 13.50 | 19.99 | 943 | 1250060 | (unnamed) MeshStandardNodeMaterial 679134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
terrain-cap-84 | savanna-driving | 23.8/42.2 | 16.00 | 18.42 | 983 | 2960520 | (unnamed) MeshStandardNodeMaterial 775006/180; travel-dressing 642100/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
all-off | savanna-standing | 16.7/17.3 | 8.90 | 6.82 | 77 | 823292 | travel-dressing 647234/37; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
all-off | desert-standing | 16.7/17.3 | 8.60 | 9.11 | 73 | 406961 | (unnamed) MeshStandardNodeMaterial 425118/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
all-off | savanna-driving | 16.7/17.3 | 8.00 | 7.54 | 76 | 816541 | travel-dressing 638836/36; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
low-preset | savanna-standing | 16.7/17.2 | 8.70 | 9.83 | 60 | 706800 | travel-dressing 535418/37; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
low-preset | desert-standing | 16.7/17.2 | 7.50 | 8.72 | 59 | 262589 | (unnamed) MeshStandardNodeMaterial 425118/180; travel-dressing 64892/36; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1
low-preset | savanna-driving | 16.7/17.0 | 7.60 | 6.95 | 66 | 705353 | travel-dressing 527660/36; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44964/215; travel-sky 1216/1

## M1 PRO (context only; gpu ms aggregate passes) — webgpu, unknown, 1728x972 dpr 2, build production 14469d0
config | phase | frame med/p95 ms | cpu med | gpu med ms | draws | tris | top systems (tris/meshes)
baseline | savanna-standing | 30.0/32.0 | 10.00 | 141.95 | 952 | 2992857 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 634898/37; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
baseline | desert-standing | 44.0/47.0 | 10.00 | 229.48 | 930 | 1306448 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
baseline | savanna-driving | 44.0/46.0 | 11.00 | 223.13 | 954 | 3031756 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 638644/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
traa-off | savanna-standing | 28.0/30.0 | 11.00 | 89.54 | 950 | 3028375 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 643778/37; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
traa-off | desert-standing | 43.0/45.0 | 9.00 | 148.21 | 928 | 1306446 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
traa-off | savanna-driving | 41.0/44.0 | 11.00 | 143.41 | 960 | 3008522 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 632836/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
ssao-off | savanna-standing | 18.0/20.0 | 11.00 | 68.83 | 959 | 3000176 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 636314/37; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
ssao-off | desert-standing | 33.0/35.0 | 10.00 | 142.92 | 929 | 1306447 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
ssao-off | savanna-driving | 32.0/34.0 | 11.00 | 137.35 | 961 | 3045387 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 642052/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
shadows-off | savanna-standing | 28.0/30.0 | 5.00 | 133.48 | 72 | 995859 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 647186/37; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
shadows-off | desert-standing | 43.0/45.0 | 4.00 | 224.78 | 72 | 544052 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
shadows-off | savanna-driving | 42.0/44.0 | 5.00 | 217.84 | 75 | 1002352 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 629764/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
shadow-half | savanna-standing | 30.0/32.0 | 11.00 | 141.54 | 956 | 3006545 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 637906/37; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
shadow-half | desert-standing | 45.0/46.0 | 10.00 | 229.50 | 930 | 1306448 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
shadow-half | savanna-driving | 44.0/46.0 | 11.00 | 222.65 | 954 | 3032524 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 638836/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
post-off | savanna-standing | 17.0/19.0 | 12.00 | 40.08 | 949 | 3029142 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 643970/37; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
post-off | desert-standing | 31.0/33.0 | 10.00 | 85.21 | 927 | 1306445 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
post-off | savanna-driving | 30.0/32.0 | 12.00 | 45.72 | 959 | 3045385 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 642052/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
dpr-1 | savanna-standing | 13.0/15.0 | 12.00 | 43.75 | 960 | 3037041 | (unnamed) MeshStandardNodeMaterial 1026334/180; travel-dressing 645530/37; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
dpr-1 | desert-standing | 14.0/16.0 | 11.00 | 65.13 | 930 | 1306448 | (unnamed) MeshStandardNodeMaterial 847134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
dpr-1 | savanna-driving | 16.0/17.0 | 12.00 | 46.73 | 962 | 2996604 | (unnamed) MeshStandardNodeMaterial 1021406/180; travel-dressing 629856/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
terrain-refine-off | savanna-standing | 30.0/31.0 | 11.00 | 136.62 | 960 | 2795617 | travel-dressing 633334/37; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
terrain-refine-off | desert-standing | 44.0/46.0 | 10.00 | 226.18 | 930 | 1152336 | (unnamed) MeshStandardNodeMaterial 425118/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
terrain-refine-off | savanna-driving | 42.0/45.0 | 12.00 | 220.23 | 954 | 2820620 | travel-dressing 638836/36; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
terrain-cap-84 | savanna-standing | 30.0/32.0 | 11.00 | 140.42 | 953 | 2921809 | (unnamed) MeshStandardNodeMaterial 779934/180; travel-dressing 643970/37; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
terrain-cap-84 | desert-standing | 44.0/46.0 | 10.00 | 227.80 | 930 | 1216848 | (unnamed) MeshStandardNodeMaterial 679134/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
terrain-cap-84 | savanna-driving | 43.0/45.0 | 12.00 | 221.79 | 954 | 2908556 | (unnamed) MeshStandardNodeMaterial 775006/180; travel-dressing 638644/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
all-off | savanna-standing | 8.0/9.0 | 5.00 | 14.43 | 67 | 799808 | travel-dressing 642122/37; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
all-off | desert-standing | 9.0/11.0 | 3.00 | 23.67 | 69 | 389937 | (unnamed) MeshStandardNodeMaterial 425118/180; travel-dressing 209252/36; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1
all-off | savanna-driving | 9.0/16.0 | 5.00 | 20.16 | 76 | 802781 | travel-dressing 642100/36; (unnamed) MeshStandardNodeMaterial 425118/180; (unnamed) MeshStandardMaterial 44968/215; travel-sky 1216/1

