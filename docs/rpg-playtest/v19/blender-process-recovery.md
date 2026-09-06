# Blender process recovery during local art work

On2026-09-06 the long-running task Blender PID1571944 disappeared during the first Cinderbranch v18 rebuild/render request. MCP reported a connection close, and no new v18 image or report existed. A host-level process check confirmed Blender was absent. Recent coredump and journal/kernel checks showed no recorded core, out-of-memory kill, or explanatory termination message; the exit cause remains unknown. An earlier object-ray exception was handled, and subsequent portal control renders completed, so that exception alone does not explain the later process exit.

The retained autosave is `tmp/blender-session/1571944_autosave.blend`,3,618,452,571bytes, modified17:25:33-0400. It was neither deleted nor loaded wholesale. Reviewed source recipes, renders and GLBs were already on disk. In-memory driver-namespace caches were lost; needed source scenes were reconstructed from their recipes.

The task renderer was restarted through the existing process-only MCP startup script. Replacement PID1996071 was verified alive; the first MCP probe closed, and a subsequent probe completed with Scene/3objects. Subsequent Cinder and Phoenix rebuild/renders and fresh portal preparation completed successfully. The probe interruption therefore did not justify another restart. No persistent user preferences were changed, and no old Blender scenes or autosave files were deleted by cleanup.

This records one confirmed process exit of unknown cause. Earlier long synchronous renders completed, and their unresponsive periods should not all be labeled crashes. The optional cleanup rejected by automatic approval review earlier remains unperformed.
