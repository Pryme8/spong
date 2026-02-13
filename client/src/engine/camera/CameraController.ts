import { FreeCamera, Vector3, Scene, Matrix } from '@babylonjs/core';

// ============================================================================
// Camera Mode Configuration
// ============================================================================
// Set FIRST_PERSON to true for first-person view, false for third-person
// First-person: Camera at eye height, wider FOV, local player mesh hidden
// Third-person: Camera orbits behind player at CAMERA_DISTANCE units
const FIRST_PERSON = true;

const AIM_MAX_RANGE = 200;
const CAMERA_DISTANCE = 6.0; // Third-person distance
const CAMERA_TARGET_OFFSET_Y = 1.75; // Third-person target offset
/** First-person camera height: inside head (head center 1.3, -0.2 so eyes are inside). Used by camera and remote weapon view. */
export const EYE_HEIGHT = 1.0;
/** First-person camera offset along look direction (into head). Also applied to weapon view node and first-person hold. */
export const EYE_FORWARD_OFFSET = 0.3;
/** Layer mask for meshes hidden from main camera (e.g. local player head). Default camera mask is 0x0FFFFFFF so this layer is not rendered. */
export const LAYER_HIDDEN_FROM_MAIN = 0x10000000;
const MOUSE_SENSITIVITY = 0.003;
const PITCH_MIN = -1.4; // ~80 degrees down
const PITCH_MAX = 1.4;  // ~80 degrees up
// Vertical FOV in radians. Human natural ~60–75°; 1.15 rad ≈ 66°
const DEFAULT_FOV = FIRST_PERSON ? 1.15 : 0.8;
const DEFAULT_RECOIL_RISE_PER_S = 12;
const DEFAULT_RECOIL_RECOVERY_PER_S = 1.0; // Finesse-based decay of accumulator (rad/s)

export class CameraController {
  private camera: FreeCamera;
  private scene: Scene;
  private target: Vector3 | null = null;
  
  // Manual rotation tracking
  private yaw = -Math.PI / 2; // Start behind player (looking down +Z)
  private pitch = 0.5; // Start looking down slightly
  
  // Input tracking
  private isPointerLocked = false;
  private lastTouchX = 0;
  private lastTouchY = 0;
  
  // Zoom tracking
  private defaultFov = DEFAULT_FOV;
  private targetFov = DEFAULT_FOV;
  private currentFov = DEFAULT_FOV;

  // Recoil: kick accumulates; drains into pitch (risePerS, weight) and degrades by finesse (recoveryPerS).
  private kickAccumulator = 0;
  private recoilRisePerS = DEFAULT_RECOIL_RISE_PER_S;
  private recoilRecoveryPerS = DEFAULT_RECOIL_RECOVERY_PER_S;

  // Debug third-person toggle
  private debugThirdPerson = false;

  /** Debug offset for first-person camera (height Y, forward = along look direction). Used by CameraDebugPanel. */
  private debugOffsetY = 0;
  private debugOffsetForward = 0;

  // Event handler references for cleanup
  private contextMenuHandler = (e: Event) => e.preventDefault();
  private clickHandler = () => {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas && !this.isPointerLocked) {
      canvas.requestPointerLock();
    }
  };
  private pointerLockChangeHandler = () => {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    this.isPointerLocked = document.pointerLockElement === canvas;
  };
  private mouseMoveHandler = (e: MouseEvent) => {
    if (this.isPointerLocked) {
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch += e.movementY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
    }
  };
  private touchStartHandler = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
    }
  };
  private touchMoveHandler = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - this.lastTouchX;
      const deltaY = touch.clientY - this.lastTouchY;
      this.yaw -= deltaX * MOUSE_SENSITIVITY;
      this.pitch += deltaY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
    }
  };

  constructor(scene: Scene) {
    this.scene = scene;
    
    // Create FreeCamera at default position (layer mask excludes LAYER_HIDDEN_FROM_MAIN so local head is not visible)
    this.camera = new FreeCamera('freeCamera', new Vector3(0, 5, -8), scene);
    this.camera.fov = DEFAULT_FOV;
    this.camera.minZ = 0.05;
    this.camera.layerMask = 0x0FFFFFFF;
    
    // Disable all default camera inputs - we'll handle rotation manually
    this.camera.inputs.clear();
    
    // Attach to canvas for pointer lock
    const canvas = scene.getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.addEventListener('contextmenu', this.contextMenuHandler);
      canvas.addEventListener('click', this.clickHandler);
      canvas.addEventListener('mousemove', this.mouseMoveHandler);
      canvas.addEventListener('touchstart', this.touchStartHandler);
      canvas.addEventListener('touchmove', this.touchMoveHandler);
    }
    
    document.addEventListener('pointerlockchange', this.pointerLockChangeHandler);

    // Don't need pointer move picking (perf optimization)
    scene.skipPointerMovePicking = true;
  }

  setTarget(position: Vector3) {
    if (!this.target) {
      this.target = position.clone();
    } else {
      this.target.copyFrom(position);
    }
  }

  update(deltaTime: number) {
    if (!this.target) return;

    const transfer = Math.min(this.kickAccumulator, this.recoilRisePerS * deltaTime);
    this.kickAccumulator -= transfer;
    this.pitch -= transfer;
    this.kickAccumulator = Math.max(0, this.kickAccumulator - this.recoilRecoveryPerS * deltaTime);
    this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));

    const pitch = this.pitch;

    const useFirstPerson = FIRST_PERSON && !this.debugThirdPerson;

    if (useFirstPerson) {
      // First-person: camera at eye height + debug offset, then move along head node's forward (horizontal only)
      const eyeY = this.target.y + EYE_HEIGHT + this.debugOffsetY;
      const headForwardX = Math.sin(this.yaw);
      const headForwardZ = Math.cos(this.yaw);
      const forwardOffset = EYE_FORWARD_OFFSET + this.debugOffsetForward;

      this.camera.position.x = this.target.x + headForwardX * forwardOffset;
      this.camera.position.y = eyeY;
      this.camera.position.z = this.target.z + headForwardZ * forwardOffset;

      const lookX = Math.sin(this.yaw) * Math.cos(pitch);
      const lookY = -Math.sin(pitch);
      const lookZ = Math.cos(this.yaw) * Math.cos(pitch);
      const lookDist = 10;
      this.camera.setTarget(new Vector3(
        this.camera.position.x + lookX * lookDist,
        this.camera.position.y + lookY * lookDist,
        this.camera.position.z + lookZ * lookDist
      ));
    } else {
      const targetY = this.target.y + CAMERA_TARGET_OFFSET_Y;
      const camX = this.target.x - Math.sin(this.yaw) * Math.cos(pitch) * CAMERA_DISTANCE;
      const camY = targetY + Math.sin(pitch) * CAMERA_DISTANCE;
      const camZ = this.target.z - Math.cos(this.yaw) * Math.cos(pitch) * CAMERA_DISTANCE;
      
      this.camera.position.x = camX;
      this.camera.position.y = camY;
      this.camera.position.z = camZ;
      this.camera.setTarget(new Vector3(this.target.x, targetY, this.target.z));
    }
    
    // Smooth FOV transition for zoom
    if (Math.abs(this.currentFov - this.targetFov) > 0.001) {
      const lerpSpeed = 10.0; // Smooth zoom transition
      this.currentFov += (this.targetFov - this.currentFov) * lerpSpeed * deltaTime;
      this.camera.fov = this.currentFov;
    }
  }

  /**
   * Returns the camera yaw angle in radians.
   */
  getYaw(): number {
    return this.yaw;
  }

  /**
   * Returns the camera pitch in radians.
   */
  getPitch(): number {
    return Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
  }

  /**
   * Get aim point by projecting 30 units from camera using manual yaw/pitch.
   *
   * @param myEntityId The local player entity ID (unused, kept for compatibility)
   */
  getAimPoint(myEntityId: number | null): Vector3 {
    const AIM_DISTANCE = 30;
    const pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
    const dirX = Math.sin(this.yaw) * Math.cos(pitch);
    const dirY = -Math.sin(pitch);
    const dirZ = Math.cos(this.yaw) * Math.cos(pitch);
    
    // Project 50 units from camera position
    return new Vector3(
      this.camera.position.x + dirX * AIM_DISTANCE,
      this.camera.position.y + dirY * AIM_DISTANCE,
      this.camera.position.z + dirZ * AIM_DISTANCE
    );
  }

  /**
   * Get the camera's position in world space.
   */
  getPosition(): Vector3 {
    return this.camera.position.clone();
  }

  /**
   * Get the camera's forward direction (where it's looking).
   */
  getForwardDirection(): Vector3 {
    return this.camera.getDirection(Vector3.Forward());
  }

  getCamera(): FreeCamera {
    return this.camera;
  }

  /**
   * Set zoom level (1 = normal, higher = zoomed in)
   */
  setZoom(zoomFactor: number): void {
    this.targetFov = this.defaultFov / zoomFactor;
  }

  /**
   * Reset zoom to default
   */
  resetZoom(): void {
    this.targetFov = this.defaultFov;
  }

  /**
   * Toggle debug third-person view (for weapon positioning debug)
   */
  toggleDebugThirdPerson(localPlayerTransform?: any): void {
    this.debugThirdPerson = !this.debugThirdPerson;
    // Local player body/head/helmet always visible (first-person and debug third-person)
    if (localPlayerTransform) {
      localPlayerTransform.setMeshVisibility(true);
    }
  }

  /**
   * Check if debug third-person is active
   */
  isDebugThirdPersonActive(): boolean {
    return this.debugThirdPerson;
  }

  /** Get first-person camera debug offset (height Y, forward = along look axis). */
  getDebugOffset(): { y: number; forward: number } {
    return { y: this.debugOffsetY, forward: this.debugOffsetForward };
  }

  /** Set first-person camera debug offset (height Y, forward = along look axis). */
  setDebugOffset(y: number, forward: number): void {
    this.debugOffsetY = y;
    this.debugOffsetForward = forward;
  }

  /**
   * Add kick to accumulator. Drains into pitch at risePerS (weight); degrades at recoveryPerS (finesse).
   */
  applyRecoilKick(kickAmount: number, options?: { risePerS?: number; recoveryPerS?: number }): void {
    this.kickAccumulator += kickAmount;
    if (options?.risePerS !== undefined) this.recoilRisePerS = options.risePerS;
    if (options?.recoveryPerS !== undefined) this.recoilRecoveryPerS = options.recoveryPerS;
  }

  /**
   * Dispose of camera controller and clean up event listeners.
   * CRITICAL: Prevents memory leaks from canvas event listeners.
   */
  dispose(): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.removeEventListener('contextmenu', this.contextMenuHandler);
      canvas.removeEventListener('click', this.clickHandler);
      canvas.removeEventListener('mousemove', this.mouseMoveHandler);
      canvas.removeEventListener('touchstart', this.touchStartHandler);
      canvas.removeEventListener('touchmove', this.touchMoveHandler);
    }
    
    document.removeEventListener('pointerlockchange', this.pointerLockChangeHandler);
  }
}
