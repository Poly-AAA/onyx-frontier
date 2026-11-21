// Everyday NPCs - Unity import settings (put this file in any "Editor" folder).
// For every NPC_*.fbx: Humanoid rig, clip names cleaned up, looping clips marked.
// For every NPC_*.png: point filtering, no compression (crisp PS1 look).
// Keep each NPC_<Name>.png next to its .fbx: Unity links the texture by name.
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public class EverydayNPCsImport : AssetPostprocessor
{
    static readonly string[] Loops = { "Idle", "Idle2", "Idle3", "Walk", "Run", "WalkScared", "Talk", "Laugh", "Sit",
        "Typing", "LeanWall", "PhoneLook", "PhoneCall", "Carry", "Push", "Cower", "ZombieIdle", "ZombieWalk", "ZombieCrawl" };

    bool IsNPC => Path.GetFileName(assetPath).StartsWith("NPC_");

    void OnPreprocessModel()
    {
        if (!IsNPC) return;
        var mi = (ModelImporter)assetImporter;
        mi.animationType = ModelImporterAnimationType.Human;
        mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
    }

    void OnPreprocessAnimation()
    {
        if (!IsNPC) return;
        var mi = (ModelImporter)assetImporter;
        var clips = mi.defaultClipAnimations;
        foreach (var c in clips)
        {
            c.name = c.name.Split('|').Last();
            c.loopTime = Loops.Contains(c.name);
        }
        mi.clipAnimations = clips;
    }

    void OnPreprocessTexture()
    {
        if (!IsNPC) return;
        var ti = (TextureImporter)assetImporter;
        ti.filterMode = FilterMode.Point;
        ti.textureCompression = TextureImporterCompression.Uncompressed;
        ti.mipmapEnabled = false;
    }
}
