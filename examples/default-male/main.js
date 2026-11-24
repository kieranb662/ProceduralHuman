    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
    import {
      TORSO_DETAILS, applyHeadDesign, applyHeadSculptStroke, buildBaseHeadAndFaceParts, buildHeadAndFaceParts,
      createAdultMaleCharacter, createProceduralMaterials, handLayout, headSculptTopology, headTargetTags,
      restoreNeckJoinNormals, syncHeadMouthRim, updateHeadPartNormals, validateHeadDesign,
    } from "@kieranb662/procedural-human";

    // =========================================================================
    // INTERACTIVE PREVIEW SCENE
    // =========================================================================

    const container = document.getElementById("viewport");
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.06);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.65;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.05, 60);
    camera.position.set(0.35, 1.35, 3.05);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.96, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 0.32;
    controls.maxDistance = 8.0;

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.45));

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.0);
    keyLight.position.set(2.8, 4.5, 3.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 14;
    keyLight.shadow.camera.left = -1.8;
    keyLight.shadow.camera.right = 1.8;
    keyLight.shadow.camera.top = 2.4;
    keyLight.shadow.camera.bottom = -0.3;
    keyLight.shadow.bias = -0.0002;
    keyLight.shadow.normalBias = 0.028;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.85);
    rimLight.position.set(-2.5, 2.8, -2.8);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 64),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.88, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(10, 20, 0x38bdf8, 0x334155);
    grid.position.y = 0.001;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    scene.add(grid);

    const character = createAdultMaleCharacter();
    scene.add(character.root);
    window.proceduralHuman = { character, createAdultMaleCharacter };

    const vertCount = character.skinnedMesh.geometry.attributes.position.count;
    const triCount = character.skinnedMesh.geometry.index.count / 3;
    const morphCount = Object.keys(character.skinnedMesh.morphTargetDictionary ?? {}).length;
    document.getElementById("statsLine").textContent =
      `1 Unified SkinnedMesh · ${character.rig.bones.length} Bones · ${morphCount} FACS Morphs · ${vertCount.toLocaleString()} Verts · ${triCount.toLocaleString()} Tris`;

    const heldProp = new THREE.Group();
    const cupBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0115, 0.0105, 0.090, 24),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.32, metalness: 0.15 })
    );
    const cupLid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0118, 0.0118, 0.006, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    cupLid.position.y = 0.048;
    heldProp.add(cupBody, cupLid);
    heldProp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), handLayout(-1).across);
    heldProp.visible = false;
    character.physicsDescriptor.handSockets.right.add(heldProp);

    const reachOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.9, roughness: 0.2 })
    );
    reachOrb.position.set(-0.28, 1.38, 0.52);
    reachOrb.visible = false;
    scene.add(reachOrb);

    const skeletonHelper = new THREE.SkeletonHelper(character.skinnedMesh);
    skeletonHelper.visible = false;
    scene.add(skeletonHelper);

    let rapierMesh = null;
    let rapierVisible = false;
    const rapierReadout = document.getElementById("rapierReadout");

    function updateRapierVisual(stance) {
      const desc =
        stance === "crouching" ? character.physicsDescriptor.crouchingCapsule :
        stance === "sitting" ? character.physicsDescriptor.sittingCapsule :
        character.physicsDescriptor.standingCapsule;

      if (rapierMesh) {
        scene.remove(rapierMesh);
        rapierMesh.geometry.dispose();
        rapierMesh.material.dispose();
      }
      const capGeo = new THREE.CapsuleGeometry(desc.radius, desc.halfHeight * 2, 10, 20);
      const capMat = new THREE.MeshBasicMaterial({ color: 0x34d399, wireframe: true, transparent: true, opacity: 0.55 });
      rapierMesh = new THREE.Mesh(capGeo, capMat);
      rapierMesh.position.y = desc.centerOffsetY;
      rapierMesh.visible = rapierVisible;
      scene.add(rapierMesh);

      const totalH = (desc.halfHeight * 2 + desc.radius * 2).toFixed(2);
      rapierReadout.textContent =
        `Rapier Capsule (${stance}):\nRAPIER.ColliderDesc.capsule(${desc.halfHeight.toFixed(2)}, ${desc.radius.toFixed(2)})\nCenter Y = ${desc.centerOffsetY.toFixed(2)}m | Total H = ${totalH}m`;
    }
    updateRapierVisual("idle");

    // --- UI Event Wiring ---
    const clothingStatus = document.getElementById("clothingStatus");
    const clothingControls = document.getElementById("clothingControls");
    const clothingSelects = {};
    const syncClothingControls = () => {
      for (const [name, slot] of Object.entries(character.clothingSlots)) clothingSelects[name].value = slot.item;
      const dressed = Object.values(character.clothingSlots).filter((slot) => slot.item !== "none").length;
      clothingStatus.textContent = dressed ? `${dressed} removable clothing layers equipped.` : "All clothing slots empty.";
    };
    const changeClothing = (change) => {
      try {
        if (headEditing) setHeadEditing(false);
        change();
        syncClothingControls();
      } catch (error) {
        console.error("Could not change clothing.", error);
        clothingStatus.textContent = error.message;
      }
    };
    for (const [name, slot] of Object.entries(character.clothingSlots)) {
      const label = document.createElement("label");
      label.className = "flex items-center justify-between gap-2";
      const title = document.createElement("span");
      title.textContent = name[0].toUpperCase() + name.slice(1);
      const select = document.createElement("select");
      select.id = `clothing-${name}`;
      select.className = "w-44 bg-slate-800 border border-slate-700 rounded-lg p-1.5";
      for (const [value, text] of Object.entries(slot.items)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
      }
      select.addEventListener("change", () => changeClothing(() => character.setClothing(name, select.value)));
      clothingSelects[name] = select;
      label.append(title, select);
      clothingControls.appendChild(label);
    }
    const outfits = {
      base: {},
      casual: { torso: "shirt", arms: "short", legs: "shorts" },
      long: { torso: "shirt", arms: "long", legs: "trousers", feet: "wraps" },
    };
    document.querySelectorAll("[data-outfit]").forEach((button) => {
      button.addEventListener("click", () => changeClothing(() => character.setOutfit(outfits[button.dataset.outfit])));
    });
    const materialNames = ["Body Skin", "Tops / Sleeves", "Shorts / Trousers", "Hair / Brows", "Eyeballs", "Head Skin", "Teeth", "Foot Wraps", "Clothing Trim (reserved)", "Mouth / Gums", "Tongue", "Nails"];
    const textureKeys = ["skin", "shirt", "shorts", "hair", null, "skin", null, null, null, null];
    const surfaceDefs = [
      ["roughness", "Roughness", 0, 1, 0.01],
      ["metalness", "Metalness", 0, 1, 0.01],
      ["bumpScale", "Bump strength", 0, 3, 0.01],
      ["sheen", "Sheen", 0, 1, 0.01],
      ["sheenRoughness", "Sheen roughness", 0, 1, 0.01],
      ["clearcoat", "Clearcoat", 0, 1, 0.01],
      ["clearcoatRoughness", "Clearcoat roughness", 0, 1, 0.01],
      ["ior", "Index of refraction", 1, 2.33, 0.01],
    ];
    const initialMaterialPalette = {
      skin: "#c68b59", shirt: "#2e5a88", shorts: "#4a4e4d", hair: "#241c18",
      textures: {
        skinDetail: 1, skinColorVariation: 1, skinRoughnessVariation: 1,
        skinPoreDepth: 1, skinScattering: 0.35, skinThicknessScale: 1,
        shirtContrast: 0.28, shortsContrast: 0.34, hairContrast: 1,
        skinTileSize: 0.064, shirtRepeatX: 10, shirtRepeatY: 10,
        shortsRepeatX: 10, shortsRepeatY: 10, hairRepeatX: 10, hairRepeatY: 3,
      },
      materials: character.skinnedMesh.material.map((material, index) => {
        const values = {};
        if (!textureKeys[index]) values.color = `#${material.color.getHexString()}`;
        for (const [key] of surfaceDefs) {
          if (typeof material[key] === "number" && (key !== "bumpScale" || material.bumpMap)) {
            values[key] = material[key];
          }
        }
        return values;
      }),
    };
    let materialPalette = structuredClone(initialMaterialPalette);
    let materialRefreshTimer = null;
    const materialSlot = document.getElementById("materialSlot");
    const materialColor = document.getElementById("materialColor");
    const materialSource = document.getElementById("materialSource");
    const materialStatus = document.getElementById("materialStatus");

    materialNames.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = `${index}: ${name}`;
      materialSlot.appendChild(option);
    });

    function updateMaterialSource() {
      const defaults = JSON.stringify(materialPalette, null, 2);
      materialSource.value = createProceduralMaterials.toString().replace(
        "function createProceduralMaterials(palette = {}) {",
        `function createProceduralMaterials(palette = {}) {
      const defaults = ${defaults};
      palette = {
        ...defaults, ...palette,
        textures: { ...defaults.textures, ...palette.textures },
        materials: defaults.materials.map((values, index) => ({
          ...values, ...palette.materials?.[index],
        })),
      };`
      );
    }

    function refreshCharacterMaterials() {
      clearTimeout(materialRefreshTimer);
      materialRefreshTimer = null;
      const nextMaterials = createProceduralMaterials(materialPalette);
      const previousMaterials = character.skinnedMesh.material;
      const wireframe = document.getElementById("wireframeToggle").checked;
      nextMaterials.forEach((material) => { material.wireframe = wireframe; });
      character.skinnedMesh.material = nextMaterials;
      character.refreshClothingMaterials();
      if (headPreviewMesh) headPreviewMesh.material = nextMaterials;
      const textures = new Set();
      previousMaterials.forEach((material) => {
        if (material.map) textures.add(material.map);
        if (material.bumpMap) textures.add(material.bumpMap);
        material.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      materialStatus.textContent = "Preview updated.";
    }

    function scheduleMaterialRefresh() {
      clearTimeout(materialRefreshTimer);
      materialStatus.textContent = "Updating procedural textures...";
      materialRefreshTimer = setTimeout(refreshCharacterMaterials, 180);
      updateMaterialSource();
    }

    function addParameterSlider(container, key, labelText, min, max, step, value, onInput, idPrefix = "material") {
      const label = document.createElement("label");
      label.className = "block";
      const caption = document.createElement("div");
      caption.className = "flex justify-between text-[11px] text-slate-400 mb-0.5";
      const title = document.createElement("span");
      title.textContent = labelText;
      const output = document.createElement("span");
      output.setAttribute("aria-hidden", "true");
      const format = (v) => idPrefix.startsWith("torso-") ? String(v) : v.toFixed(2);
      output.textContent = format(value);
      caption.append(title, output);
      const input = document.createElement("input");
      input.type = "range";
      input.id = `${idPrefix}-${key}`;
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = value;
      input.className = "w-full";
      input.addEventListener("input", () => {
        const value = Number(input.value);
        output.textContent = format(value);
        onInput(value);
      });
      label.append(caption, input);
      container.appendChild(label);
    }

    const torsoTools = document.getElementById("torsoTools");
    const torsoControls = document.getElementById("torsoControls");
    let pendingTorsoChanges = {};
    let torsoUpdateFrame = null;
    function scheduleTorsoUpdate(group, key, value) {
      (pendingTorsoChanges[group] ??= {})[key] = value;
      if (torsoUpdateFrame !== null) return;
      torsoUpdateFrame = requestAnimationFrame(() => {
        const changes = pendingTorsoChanges;
        pendingTorsoChanges = {};
        torsoUpdateFrame = null;
        character.setTorsoDetails(changes);
      });
    }
    function showTorsoControls() {
      const settings = character.torsoDetails;
      torsoControls.replaceChildren();
      for (const [group, { label, sliders }] of Object.entries(TORSO_DETAILS)) {
        const section = document.createElement("section");
        section.className = "bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-2";
        const toggleLabel = document.createElement("label");
        toggleLabel.className = "flex items-center gap-2 font-semibold text-slate-200 cursor-pointer";
        const toggle = document.createElement("input");
        toggle.id = `torso-${group}-enabled`;
        toggle.type = "checkbox";
        toggle.checked = settings[group].enabled;
        const fields = document.createElement("fieldset");
        fields.className = "space-y-2 disabled:opacity-50";
        fields.setAttribute("aria-label", label);
        fields.disabled = !toggle.checked;
        toggle.addEventListener("change", () => {
          fields.disabled = !toggle.checked;
          scheduleTorsoUpdate(group, "enabled", toggle.checked);
        });
        toggleLabel.append(toggle, label);
        for (const [key, title, min, max, step] of sliders) {
          addParameterSlider(fields, key, title, min, max, step, settings[group][key],
            (value) => scheduleTorsoUpdate(group, key, value), `torso-${group}`);
        }
        section.append(toggleLabel, fields);
        torsoControls.appendChild(section);
      }
    }
    showTorsoControls();
    document.getElementById("resetTorsoBtn").addEventListener("click", () => {
      if (torsoUpdateFrame !== null) cancelAnimationFrame(torsoUpdateFrame);
      torsoUpdateFrame = null;
      pendingTorsoChanges = {};
      character.resetTorsoDetails();
      showTorsoControls();
    });

    function showMaterialControls() {
      const index = Number(materialSlot.value);
      const textureKey = textureKeys[index];
      materialColor.value = textureKey ? materialPalette[textureKey] : materialPalette.materials[index].color;
      document.getElementById("materialColorLabel").textContent = textureKey ? "Texture color" : index === 4 ? "Eye tint" : "Base color";
      const textureControls = document.getElementById("textureControls");
      const surfaceControls = document.getElementById("surfaceControls");
      textureControls.replaceChildren();
      surfaceControls.replaceChildren();
      if (textureKey) {
        const detailKey = textureKey === "skin" ? "skinDetail" : `${textureKey}Contrast`;
        addParameterSlider(textureControls, detailKey, textureKey === "skin" ? "Pores / tone detail" : "Texture contrast",
          0, textureKey === "shirt" || textureKey === "shorts" ? 1 : 2, 0.01, materialPalette.textures[detailKey], (value) => {
            materialPalette.textures[detailKey] = value;
            scheduleMaterialRefresh();
          });
        if (textureKey === "skin") {
          for (const [key, label, min, max] of [
            ["skinPoreDepth", "Pore depth", 0, 2],
            ["skinColorVariation", "Anatomical color variation", 0, 2],
            ["skinRoughnessVariation", "Regional roughness variation", 0, 2],
            ["skinScattering", "Subsurface scattering (approx.)", 0, 1],
            ["skinThicknessScale", "Scattering thickness multiplier", 0.25, 4],
          ]) {
            addParameterSlider(textureControls, key, label, min, max, 0.01,
              materialPalette.textures[key], (value) => {
                materialPalette.textures[key] = value;
                scheduleMaterialRefresh();
              });
          }
          addParameterSlider(textureControls, "skinTileSize", "Skin tile size (mm)", 16, 256, 1,
            materialPalette.textures.skinTileSize * 1000, (value) => {
              materialPalette.textures.skinTileSize = value / 1000;
              scheduleMaterialRefresh();
            });
        }
        for (const axis of textureKey === "skin" ? [] : ["X", "Y"]) {
          const key = `${textureKey}Repeat${axis}`;
          addParameterSlider(textureControls, key, `Texture tiling ${axis}`, 1, 30, 0.1, materialPalette.textures[key], (value) => {
            materialPalette.textures[key] = value;
            character.skinnedMesh.material.forEach((material, slot) => {
              if (textureKeys[slot] === textureKey) {
                for (const texture of [material.map, material.bumpMap]) {
                  texture.repeat[axis.toLowerCase()] = value;
                }
              }
            });
            updateMaterialSource();
          });
        }
      }
      for (const [key, label, min, max, step] of surfaceDefs) {
        if (!(key in materialPalette.materials[index])) continue;
        if (textureKey === "skin" && key === "bumpScale") {
          addParameterSlider(surfaceControls, key, "Bump height (mm)", 0, 1, 0.01,
            materialPalette.materials[index][key] * 1000, (value) => {
              materialPalette.materials[index][key] = value / 1000;
              character.skinnedMesh.material[index].bumpScale = value / 1000;
              updateMaterialSource();
              materialStatus.textContent = "Preview updated.";
            });
          continue;
        }
        addParameterSlider(surfaceControls, key, label, min, max, step, materialPalette.materials[index][key], (value) => {
          materialPalette.materials[index][key] = value;
          character.skinnedMesh.material[index].setValues({ [key]: value });
          updateMaterialSource();
          materialStatus.textContent = "Preview updated.";
        });
      }
    }

    materialSlot.addEventListener("change", showMaterialControls);
    materialColor.addEventListener("input", () => {
      const index = Number(materialSlot.value);
      const textureKey = textureKeys[index];
      if (textureKey) {
        materialPalette[textureKey] = materialColor.value;
        scheduleMaterialRefresh();
      } else {
        materialPalette.materials[index].color = materialColor.value;
        character.skinnedMesh.material[index].color.set(materialColor.value);
        updateMaterialSource();
        materialStatus.textContent = "Preview updated.";
      }
    });
    document.getElementById("resetMaterialsBtn").addEventListener("click", () => {
      materialPalette = structuredClone(initialMaterialPalette);
      refreshCharacterMaterials();
      showMaterialControls();
      updateMaterialSource();
      materialStatus.textContent = "All materials reset.";
    });
    document.getElementById("copyMaterialsBtn").addEventListener("click", async () => {
      if (materialRefreshTimer !== null) refreshCharacterMaterials();
      try {
        await navigator.clipboard.writeText(materialSource.value);
        materialStatus.textContent = "Function copied.";
      } catch (error) {
        console.error("Could not copy procedural materials:", error);
        materialSource.focus();
        materialSource.select();
        materialStatus.textContent = "Clipboard unavailable. Function selected; copy manually or export .js.";
      }
    });
    document.getElementById("exportMaterialsBtn").addEventListener("click", () => {
      if (materialRefreshTimer !== null) refreshCharacterMaterials();
      const blob = new Blob([`${materialSource.value}\n`], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "createProceduralMaterials.js";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      materialStatus.textContent = "Function exported.";
    });
    const toolTabs = [["rigTabBtn", "rigTools"], ["materialsTabBtn", "materialTools"],
      ["headTabBtn", "headTools"], ["torsoTabBtn", "torsoTools"]];
    for (const [tabId] of toolTabs) {
      document.getElementById(tabId).addEventListener("click", () => {
        try { setHeadEditing(tabId === "headTabBtn"); } catch (error) { reportHeadError(error); return; }
        for (const [id, panel] of toolTabs) {
          const active = id === tabId;
          document.getElementById(panel).hidden = !active;
          const button = document.getElementById(id);
          button.setAttribute("aria-pressed", String(active));
          button.classList.toggle("bg-sky-500", active);
          button.classList.toggle("text-slate-950", active);
          button.classList.toggle("bg-slate-800", !active);
          button.classList.toggle("text-slate-200", !active);
        }
        resizePreviewViewport();
      });
    }
    showMaterialControls();
    updateMaterialSource();

    const headStorageKey = "procedural-human-head-design-v1";
    const headStatus = document.getElementById("headStatus");
    const headSource = document.getElementById("headSource");
    const headPart = document.getElementById("headPart");
    const headBrush = document.getElementById("headBrush");
    const headRadius = document.getElementById("headRadius");
    const headStrength = document.getElementById("headStrength");
    const defaultHeadDesign = structuredClone(character.headDesign);
    let headDesign = structuredClone(defaultHeadDesign);
    let headEditing = false;
    let headPreview = null;
    let headPreviewMesh = null;
    let headRebuildFrame = null;
    let headPointerFrame = null;
    let headGesture = null;
    let pendingHeadPointer = null;
    let headSliderGesture = false;
    let savedHeadView = null;
    const headUndo = [], headRedo = [];
    const headRaycaster = new THREE.Raycaster();
    const headPointer = new THREE.Vector2();
    const brushPoints = Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 32), Math.sin(i * Math.PI / 32), 0));
    const headCursor = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(brushPoints),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false, transparent: true, opacity: 0.9 })
    );
    headCursor.visible = false;
    headCursor.renderOrder = 10;
    scene.add(headCursor);

    function reportHeadError(error) {
      console.error("Head editor:", error);
      headStatus.textContent = `Head editor error: ${error.message}`;
    }

    function updateHeadSource() {
      let source = buildHeadAndFaceParts.toString().replace(
        /const defaults = [\s\S]*?;\n/,
        `const defaults = ${JSON.stringify(headDesign, null, 2)};\n`
      );
      if (!source.includes("function buildBaseHeadAndFaceParts(")) {
        const helpers = [headTargetTags, validateHeadDesign, headSculptTopology, updateHeadPartNormals,
          syncHeadMouthRim, applyHeadSculptStroke, applyHeadDesign, buildBaseHeadAndFaceParts];
        source = source.replace("const parts = buildBaseHeadAndFaceParts(rig);",
          `${helpers.map((fn) => fn.toString()).join("\n\n")}\n\n      const parts = buildBaseHeadAndFaceParts(rig);`);
      }
      headSource.value = source;
      document.getElementById("undoHeadBtn").disabled = headUndo.length === 0;
      document.getElementById("redoHeadBtn").disabled = headRedo.length === 0;
    }

    function saveHeadDesign() {
      updateHeadSource();
      try {
        localStorage.setItem(headStorageKey, JSON.stringify(headDesign));
        headStatus.textContent = `${headDesign.strokes.length} procedural brush dabs. Saved in this browser.`;
      } catch (error) {
        console.error("Could not save head design:", error);
        headStatus.textContent = "Browser storage unavailable. Copy or export the function to keep your edits.";
      }
    }

    function rememberHeadDesign() {
      headUndo.push(structuredClone(headDesign));
      if (headUndo.length > 50) headUndo.shift();
      headRedo.length = 0;
    }

    function disposeHeadPreview(preview) {
      if (!preview) return;
      preview.geometry.dispose();
      for (const part of preview.parts) part.geo.dispose();
    }

    function rebuildHeadPreview() {
      if (headRebuildFrame !== null) cancelAnimationFrame(headRebuildFrame);
      headRebuildFrame = null;
      const next = character.createHeadPreview(headDesign);
      const previous = headPreview;
      headPreview = next;
      if (!headPreviewMesh) {
        headPreviewMesh = new THREE.Mesh(next.geometry, character.skinnedMesh.material);
        headPreviewMesh.name = "NeutralHeadEditor";
        headPreviewMesh.castShadow = true;
        headPreviewMesh.receiveShadow = true;
        character.root.add(headPreviewMesh);
      } else {
        headPreviewMesh.geometry = next.geometry;
      }
      disposeHeadPreview(previous);
      headPreviewMesh.updateMatrixWorld(true);
    }

    function scheduleHeadPreview() {
      if (headRebuildFrame !== null) return;
      headRebuildFrame = requestAnimationFrame(() => {
        try { rebuildHeadPreview(); } catch (error) { reportHeadError(error); }
      });
    }

    function setHeadEditing(active) {
      if (active === headEditing) return;
      finishHeadGesture();
      if (active) {
        rebuildHeadPreview();
        savedHeadView = {
          position: camera.position.clone(), target: controls.target.clone(),
          buttons: { ...controls.mouseButtons }, held: heldProp.visible,
          reach: reachOrb.visible, skeleton: skeletonHelper.visible, rapier: rapierMesh.visible,
          cameraButton: ["camFullBtn", "camFaceBtn", "camHandsBtn"].find((id) => document.getElementById(id).classList.contains("bg-sky-500")),
        };
        headEditing = true;
        character.skinnedMesh.visible = false;
        character.clothingRoot.visible = false;
        heldProp.visible = reachOrb.visible = skeletonHelper.visible = rapierMesh.visible = false;
        controls.mouseButtons.LEFT = headBrush.value === "orbit" ? THREE.MOUSE.ROTATE : null;
        controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
        setHeadView("front");
        headStatus.textContent = "Neutral-pose editor active. Sculpt directly on the selected part.";
      } else {
        if (headRebuildFrame !== null) rebuildHeadPreview();
        headPreview.parts.design = structuredClone(headDesign);
        character.commitHeadPreview(headPreview);
        character.headDesign = structuredClone(headDesign);
        headEditing = false;
        character.skinnedMesh.visible = true;
        character.clothingRoot.visible = true;
        character.root.remove(headPreviewMesh);
        disposeHeadPreview(headPreview);
        headPreview = headPreviewMesh = null;
        headCursor.visible = false;
        controls.mouseButtons = savedHeadView.buttons;
        camera.position.copy(savedHeadView.position);
        controls.target.copy(savedHeadView.target);
        heldProp.visible = savedHeadView.held;
        reachOrb.visible = savedHeadView.reach;
        skeletonHelper.visible = savedHeadView.skeleton;
        rapierMesh.visible = savedHeadView.rapier;
        camLerp = null;
        for (const id of ["camFullBtn", "camFaceBtn", "camHandsBtn"]) {
          const button = document.getElementById(id), active = id === savedHeadView.cameraButton;
          button.classList.toggle("bg-sky-500", active);
          button.classList.toggle("text-slate-950", active);
          button.classList.toggle("bg-slate-800", !active);
          button.classList.toggle("text-slate-200", !active);
        }
        savedHeadView = null;
        controls.update();
        headStatus.textContent = "Head applied. Animation and facial controls restored.";
      }
      document.getElementById("headEditorToggle").checked = headEditing;
      renderer.domElement.style.cursor = headEditing && headBrush.value !== "orbit" ? "crosshair" : "";
      resizePreviewViewport();
    }

    function setHeadView(view) {
      if (!headEditing) setHeadEditing(true);
      camLerp = null;
      const positions = { front: [0, 1.662, 0.56], left: [0.46, 1.662, 0.22], right: [-0.46, 1.662, 0.22] };
      camera.position.set(...positions[view]);
      controls.target.set(0, 1.662, 0.035);
      controls.update();
      camera.updateMatrixWorld();
      ["camFullBtn", "camFaceBtn", "camHandsBtn"].forEach((id) => {
        document.getElementById(id).classList.remove("bg-sky-500", "text-slate-950");
        document.getElementById(id).classList.add("bg-slate-800", "text-slate-200");
      });
    }

    function showHeadControls() {
      const transforms = document.getElementById("headTransformControls");
      const features = document.getElementById("headFeatureControls");
      transforms.replaceChildren();
      features.replaceChildren();
      const target = headPart.value;
      const transform = headDesign.transforms[target] ?? {};
      for (const [key, label, min, max, step, defaultValue] of [
        ["sx", "Width / spacing", 0.7, 1.3, 0.01, 1], ["sy", "Height", 0.7, 1.3, 0.01, 1],
        ["sz", "Depth", 0.7, 1.3, 0.01, 1], ["x", "Horizontal offset (mm)", -30, 30, 0.5, 0],
        ["y", "Vertical offset (mm)", -30, 30, 0.5, 0], ["z", "Forward offset (mm)", -30, 30, 0.5, 0],
      ]) {
        addParameterSlider(transforms, key, label, min, max, step, transform[key] ?? defaultValue, (value) => {
          beginHeadSlider();
          headDesign.transforms[target] ??= {};
          headDesign.transforms[target][key] = value;
          scheduleHeadPreview();
        }, "head");
      }
      for (const [key, label] of [
        ["forehead", "Forehead fullness"], ["noseWidth", "Nose wing width"], ["noseTip", "Nose projection"],
        ["cheeks", "Cheek fullness"], ["jawWidth", "Jaw width"], ["chin", "Chin projection"], ["lips", "Lip fullness"],
      ]) {
        addParameterSlider(features, key, `${label} (mm)`, -10, 10, 0.25, headDesign.features[key] ?? 0, (value) => {
          beginHeadSlider();
          headDesign.features[key] = value;
          scheduleHeadPreview();
        }, "head");
      }
      for (const input of [...transforms.querySelectorAll("input"), ...features.querySelectorAll("input")]) {
        input.addEventListener("change", () => {
          headSliderGesture = false;
          saveHeadDesign();
        });
      }
    }

    function beginHeadSlider() {
      if (!headEditing) setHeadEditing(true);
      finishHeadGesture();
      if (!headSliderGesture) rememberHeadDesign();
      headSliderGesture = true;
    }

    function pickHeadPoint(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      headPointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      headRaycaster.setFromCamera(headPointer, camera);
      const tags = headTargetTags(headPart.value);
      const hit = headRaycaster.intersectObject(headPreviewMesh).find((hit) => {
        const index = hit.faceIndex * 3;
        return headPreview.ranges.some((range) => tags.includes(range.part.tag) &&
          index >= range.indexStart && index < range.indexStart + range.indexCount);
      });
      if (!hit) { headCursor.visible = false; return null; }
      const normal = hit.normal ?? hit.face.normal;
      const worldNormal = normal.clone().transformDirection(headPreviewMesh.matrixWorld);
      headCursor.position.copy(hit.point).addScaledVector(worldNormal, 0.0005);
      headCursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
      headCursor.scale.setScalar(Number(headRadius.value) / 1000);
      headCursor.visible = headBrush.value !== "orbit";
      return { point: headPreviewMesh.worldToLocal(hit.point.clone()), normal: normal.clone(), worldPoint: hit.point.clone() };
    }

    function syncHeadPreviewVertices() {
      const pos = headPreview.geometry.attributes.position;
      const normals = headPreview.geometry.attributes.normal;
      const tags = new Set([...headTargetTags(headGesture.target), "cavity"]);
      for (const range of headPreview.ranges) {
        if (!tags.has(range.part.tag)) continue;
        updateHeadPartNormals(range.part);
        pos.array.set(range.part.geo.attributes.position.array, range.offset * 3);
        normals.array.set(range.part.geo.attributes.normal.array, range.offset * 3);
      }
      restoreNeckJoinNormals(headPreview.geometry);
      pos.needsUpdate = normals.needsUpdate = true;
      headPreview.geometry.computeBoundingSphere();
      headPreview.geometry.computeBoundingBox();
    }

    function sculptHeadPointer(event, initial = false) {
      const gesture = headGesture;
      if (!gesture) return;
      const strength = gesture.strength;
      let center, delta;
      if (gesture.mode === "move") {
        pickHeadPoint(event);
        const point = headRaycaster.ray.intersectPlane(gesture.plane, new THREE.Vector3());
        if (!point) return;
        delta = headPreviewMesh.worldToLocal(point.clone())
          .sub(headPreviewMesh.worldToLocal(gesture.lastPlanePoint.clone())).multiplyScalar(strength);
        gesture.lastPlanePoint.copy(point);
        if (delta.lengthSq() < 1e-12) return;
        center = gesture.center.clone();
        gesture.center.add(delta);
      } else {
        const hit = pickHeadPoint(event);
        if (!hit) return;
        center = hit.point;
        if (!initial && gesture.lastCenter && center.distanceTo(gesture.lastCenter) < gesture.radius * 0.12) return;
        gesture.lastCenter = center.clone();
        const sign = (gesture.mode === "lower" ? -1 : 1) * (event.shiftKey ? -1 : 1);
        delta = hit.normal.multiplyScalar(sign * strength * 0.002);
      }
      const stroke = {
        target: gesture.target, mode: gesture.mode, center: center.toArray(), delta: delta.toArray(),
        radius: gesture.radius, strength, mirror: gesture.mirror, mirrorX: gesture.mirrorX,
      };
      const changed = applyHeadSculptStroke(headPreview.parts, stroke);
      if (!changed) return;
      if (!gesture.changed) { rememberHeadDesign(); gesture.changed = true; }
      headDesign.strokes.push(stroke);
      syncHeadPreviewVertices();
    }

    function finishHeadGesture() {
      if (headPointerFrame !== null) cancelAnimationFrame(headPointerFrame);
      headPointerFrame = null;
      if (!headGesture) return;
      if (pendingHeadPointer) sculptHeadPointer(pendingHeadPointer);
      pendingHeadPointer = null;
      const gesture = headGesture;
      headGesture = null;
      controls.enabled = true;
      if (renderer.domElement.hasPointerCapture(gesture.pointerId)) renderer.domElement.releasePointerCapture(gesture.pointerId);
      if (gesture.changed) {
        rebuildHeadPreview();
        saveHeadDesign();
      }
    }

    renderer.domElement.addEventListener("pointerdown", (event) => {
      if (!headEditing || headBrush.value === "orbit" || event.button !== 0 || headGesture) return;
      if (headRebuildFrame !== null) rebuildHeadPreview();
      const hit = pickHeadPoint(event);
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      controls.enabled = false;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.worldPoint);
      headGesture = {
        pointerId: event.pointerId, target: headPart.value, mode: headBrush.value,
        radius: Number(headRadius.value) / 1000, strength: Number(headStrength.value),
        mirror: document.getElementById("headMirror").checked, center: hit.point,
        mirrorX: ((headDesign.transforms.all?.x ?? 0) + (headPart.value === "all" ? 0 : headDesign.transforms[headPart.value]?.x ?? 0)) / 1000,
        plane, lastPlanePoint: hit.worldPoint.clone(), changed: false,
      };
      renderer.domElement.setPointerCapture(event.pointerId);
      if (headGesture.mode !== "move") sculptHeadPointer(event, true);
    }, true);
    renderer.domElement.addEventListener("pointermove", (event) => {
      if (!headEditing) return;
      if (!headGesture) { if (event.buttons === 0) pickHeadPoint(event); return; }
      if (event.pointerId !== headGesture.pointerId) return;
      event.stopImmediatePropagation();
      pendingHeadPointer = event;
      if (headPointerFrame !== null) return;
      headPointerFrame = requestAnimationFrame(() => {
        headPointerFrame = null;
        const pointer = pendingHeadPointer;
        pendingHeadPointer = null;
        try { sculptHeadPointer(pointer); } catch (error) { finishHeadGesture(); reportHeadError(error); }
      });
    }, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      renderer.domElement.addEventListener(type, (event) => {
        if (headGesture && event.pointerId === headGesture.pointerId) {
          event.stopImmediatePropagation();
          finishHeadGesture();
        }
      }, true);
    }
    renderer.domElement.addEventListener("pointerleave", () => { if (!headGesture) headCursor.visible = false; });
    window.addEventListener("blur", finishHeadGesture);

    document.getElementById("headEditorToggle").addEventListener("change", (event) => {
      try { setHeadEditing(event.target.checked); } catch (error) { reportHeadError(error); }
    });
    document.querySelectorAll("[data-head-view]").forEach((button) => {
      button.addEventListener("click", () => setHeadView(button.dataset.headView));
    });
    headPart.addEventListener("change", () => { finishHeadGesture(); showHeadControls(); headCursor.visible = false; });
    headBrush.addEventListener("change", () => {
      finishHeadGesture();
      if (headEditing) controls.mouseButtons.LEFT = headBrush.value === "orbit" ? THREE.MOUSE.ROTATE : null;
      renderer.domElement.style.cursor = headEditing && headBrush.value !== "orbit" ? "crosshair" : "";
      headCursor.visible = false;
    });
    headRadius.addEventListener("input", () => { document.getElementById("headRadiusValue").textContent = `${headRadius.value} mm`; });
    headStrength.addEventListener("input", () => { document.getElementById("headStrengthValue").textContent = Number(headStrength.value).toFixed(2); });

    function restoreHeadHistory(from, to) {
      finishHeadGesture();
      headSliderGesture = false;
      if (!from.length) return;
      if (!headEditing) setHeadEditing(true);
      to.push(structuredClone(headDesign));
      headDesign = from.pop();
      rebuildHeadPreview();
      showHeadControls();
      saveHeadDesign();
    }
    document.getElementById("undoHeadBtn").addEventListener("click", () => restoreHeadHistory(headUndo, headRedo));
    document.getElementById("redoHeadBtn").addEventListener("click", () => restoreHeadHistory(headRedo, headUndo));
    document.getElementById("resetHeadBtn").addEventListener("click", () => {
      finishHeadGesture();
      if (!headEditing) setHeadEditing(true);
      rememberHeadDesign();
      headDesign = structuredClone(defaultHeadDesign);
      rebuildHeadPreview();
      showHeadControls();
      saveHeadDesign();
    });
    document.addEventListener("keydown", (event) => {
      if (!headEditing || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      event.preventDefault();
      restoreHeadHistory(event.shiftKey ? headRedo : headUndo, event.shiftKey ? headUndo : headRedo);
    });
    document.getElementById("copyHeadBtn").addEventListener("click", async () => {
      finishHeadGesture();
      updateHeadSource();
      try {
        await navigator.clipboard.writeText(headSource.value);
        headStatus.textContent = "Replacement head function copied.";
      } catch (error) {
        console.error("Could not copy procedural head:", error);
        headSource.focus();
        headSource.select();
        headStatus.textContent = "Clipboard unavailable. Function selected; copy manually or export .js.";
      }
    });
    document.getElementById("exportHeadBtn").addEventListener("click", () => {
      finishHeadGesture();
      updateHeadSource();
      const url = URL.createObjectURL(new Blob([`${headSource.value}\n`], { type: "text/javascript" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "buildHeadAndFaceParts.js";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      headStatus.textContent = "Replacement head function exported.";
    });
    showHeadControls();
    updateHeadSource();
    try {
      const stored = localStorage.getItem(headStorageKey);
      if (stored) {
        const design = JSON.parse(stored);
        validateHeadDesign(design);
        const preview = character.createHeadPreview(design);
        character.commitHeadPreview(preview);
        disposeHeadPreview(preview);
        headDesign = design;
        character.headDesign = structuredClone(design);
        showHeadControls();
        updateHeadSource();
        headStatus.textContent = "Previous head edits restored from this browser.";
      }
    } catch (error) {
      console.error("Could not restore head design:", error);
      headStatus.textContent = "Saved head design could not be restored. Original head retained; reset edits or export a new design.";
    }

    function setActiveGroupBtn(selector, activeEl) {
      document.querySelectorAll(selector).forEach((btn) => {
        const isAct = btn === activeEl;
        btn.classList.toggle("bg-sky-500", isAct);
        btn.classList.toggle("text-slate-950", isAct);
        btn.classList.toggle("bg-slate-800", !isAct);
        btn.classList.toggle("text-slate-200", !isAct);
      });
    }

    document.querySelectorAll(".base-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const state = btn.dataset.base;
        character.setBaseAnimation(state);
        document.getElementById("baseStateBadge").textContent = state;
        setActiveGroupBtn(".base-btn", btn);
        updateRapierVisual(state);
      });
    });

    document.querySelectorAll(".upper-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const state = btn.dataset.upper;
        character.setUpperAnimation(state);
        heldProp.visible = state === "holding";
        reachOrb.visible = state === "reaching";
        setActiveGroupBtn(".upper-btn", btn);
      });
    });

    document.querySelectorAll(".face-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        character.setFaceExpression(btn.dataset.face);
        setActiveGroupBtn(".face-btn", btn);
      });

      document.querySelectorAll(".hand-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          character.setHandGesture(btn.dataset.hand);
          setActiveGroupBtn(".hand-btn", btn);
        });
      });
    });

    document.getElementById("blinkNowBtn").addEventListener("click", () => character.triggerBlink());

    const sliderDefs = [
      ["slJaw", "valJaw", "jaw"],
      ["slTongueOut", "valTongueOut", "tongueOut"],
      ["slTongueCurl", "valTongueCurl", "tongueCurl"],
      ["slSmile", "valSmile", "smile"],
      ["slPucker", "valPucker", "pucker"],
      ["slBrowUp", "valBrowUp", "browUp"],
      ["slBrowDown", "valBrowDown", "browDown"],
      ["slCheek", "valCheek", "cheek"],
      ["slUpperLip", "valUpperLip", "upperLip"],
      ["slLowerLip", "valLowerLip", "lowerLip"],
      ["slLidTop", "valLidTop", "lidTop"],
      ["slLidBot", "valLidBot", "lidBot"],
      ["slEyeX", "valEyeX", "eyeX"],
      ["slEyeY", "valEyeY", "eyeY"],
      ["slNose", "valNose", "nose"],
      ["slEars", "valEars", "ears"],
    ];
    for (const [slId, valId, key] of sliderDefs) {
      const el = document.getElementById(slId);
      const out = document.getElementById(valId);
      el.addEventListener("input", () => {
        const v = parseFloat(el.value);
        character.faceSliders[key] = v;
        out.textContent = v.toFixed(2);
      });
    }

    document.getElementById("resetFaceSlidersBtn").addEventListener("click", () => {
      for (const [slId, valId, key] of sliderDefs) {
        document.getElementById(slId).value = "0";
        document.getElementById(valId).textContent = "0.00";
        character.faceSliders[key] = 0;
      }
    });

    let camLerp = null;
    let focusedHand = null;
    function setCameraView(pos, target, activeBtnId) {
      if (headEditing) setHeadEditing(false);
      focusedHand = null;
      camLerp = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target), t: 0 };
      ["camFullBtn", "camFaceBtn", "camHandsBtn"].forEach((id) => {
        const b = document.getElementById(id);
        const on = id === activeBtnId;
        b.classList.toggle("bg-sky-500", on);
        b.classList.toggle("text-slate-950", on);
        b.classList.toggle("bg-slate-800", !on);
        b.classList.toggle("text-slate-200", !on);
      });
    }
    document.getElementById("camFullBtn").addEventListener("click", () => setCameraView([0.35, 1.35, 3.05], [0, 0.96, 0], "camFullBtn"));
    document.getElementById("camFaceBtn").addEventListener("click", () => setCameraView([0.08, 1.66, 0.58], [0, 1.64, 0.04], "camFaceBtn"));
    const handViewTarget = (side) => {
      const hl = handLayout(side === "L" ? 1 : -1);
      const local = hl.palmDir.clone().multiplyScalar(0.070);
      return character.rig.boneMap.get(`Hand_${side}`).localToWorld(local);
    };
    function inspectHand(side) {
      character.root.updateMatrixWorld(true);
      const target = handViewTarget(side);
      setCameraView(target.clone().add(new THREE.Vector3(side === "L" ? 0.12 : -0.12, 0.04, 0.34)).toArray(),
        target.toArray(), "camHandsBtn");
      focusedHand = side;
    }
    document.getElementById("camHandsBtn").addEventListener("click", () => inspectHand("L"));
    document.getElementById("viewLeftHand").addEventListener("click", () => inspectHand("L"));
    document.getElementById("viewRightHand").addEventListener("click", () => inspectHand("R"));
    document.getElementById("torsoFrontBtn").addEventListener("click", () => setCameraView([0.19, 1.33, 1.28], [0, 1.22, 0.03]));
    document.getElementById("torsoRearBtn").addEventListener("click", () => setCameraView([0.24, 1.18, -1.17], [0, 1.09, -0.04]));

    document.getElementById("showSkeletonToggle").addEventListener("change", (e) => {
      skeletonHelper.visible = e.target.checked;
    });
    document.getElementById("showRapierToggle").addEventListener("change", (e) => {
      rapierVisible = e.target.checked;
      if (rapierMesh) rapierMesh.visible = rapierVisible;
    });
    document.getElementById("wireframeToggle").addEventListener("change", (e) => {
      const wf = e.target.checked;
      for (const m of character.skinnedMesh.material) m.wireframe = wf;
    });

    const controlPanel = document.getElementById("controlPanel");
    document.getElementById("togglePanelBtn").addEventListener("click", () => {
      controlPanel.classList.toggle("translate-x-[120%]");
    });
    document.getElementById("closePanelBtn").addEventListener("click", () => {
      controlPanel.classList.add("translate-x-[120%]");
    });

    function resizePreviewViewport() {
      const docked = (headEditing || !torsoTools.hidden) && window.matchMedia("(min-width: 768px)").matches;
      container.style.width = docked ? "calc(100% - 340px)" : "100%";
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", resizePreviewViewport);

    const timer = new THREE.Timer();
    timer.connect(document);
    const autoBlinkEl = document.getElementById("autoBlinkToggle");
    const autoGazeEl = document.getElementById("autoGazeToggle");

    function animate(timestamp) {
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();

      if (reachOrb.visible) {
        reachOrb.position.set(
          -0.24 + Math.sin(elapsed * 1.4) * 0.16,
          1.34 + Math.cos(elapsed * 1.9) * 0.14,
          0.48 + Math.sin(elapsed * 0.9) * 0.08
        );
      }

      if (camLerp) {
        camera.position.lerp(camLerp.pos, Math.min(1, dt * 6));
        controls.target.lerp(camLerp.target, Math.min(1, dt * 6));
        if (camera.position.distanceTo(camLerp.pos) < 0.01 && controls.target.distanceTo(camLerp.target) < 0.01) {
          camLerp = null;
        }
      }

      character.update(dt, {
        headEditor: headEditing,
        autoBlink: autoBlinkEl.checked,
        autoGaze: autoGazeEl.checked,
        reachTarget: reachOrb.visible ? reachOrb.position : null,
      });

      if (focusedHand && !headEditing) {
        character.root.updateMatrixWorld(true);
        const target = handViewTarget(focusedHand);
        const delta = target.clone().sub(camLerp ? camLerp.target : controls.target);
        if (camLerp) {
          camLerp.pos.add(delta);
          camLerp.target.copy(target);
        } else {
          camera.position.add(delta);
          controls.target.copy(target);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    }

    renderer.setAnimationLoop(animate);
