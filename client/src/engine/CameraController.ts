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
const EYE_HEIGHT = 1.9; // First-person eye height (head cube at y=1.3, eyes near top at +0.6)
const MOUSE_SENSITIVITY = 0.003;
const PITCH_MIN = -1.4; // ~80 degrees down
const PITCH_MAX = 1.4;  // ~80 degrees up
const DEFAULT_FOV = FIRST_PERSON ? 1.0 : 0.8; // Wider FOV for first-person

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
  
  // Debug third-person toggle
  private debugThirdPerson = false;

  constructor(scene: Scene) {
    this.scene = scene;
    
    // Create FreeCamera at default position
    this.camera = new FreeCamera('freeCamera', new Vector3(0, 5, -8), scene);
    this.camera.fov = DEFAULT_FOV;
    this.camera.minZ = 0.05;
    
    // Disable all default camera inputs - we'll handle rotation manually
    this.camera.inputs.clear();
    
    // Attach to canvas for pointer lock
    const canvas = scene.getEngine().getRenderingCanvas();
    if (canvas) {
      // Prevent context menu on right-click
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
      
      // Desktop: pointer lock for mouse rotation
      canvas.addEventListener('click', () => {
        if (!this.isPointerLocked) {
          canvas.requestPointerLock();
        }
      });
      
      document.addEventListener('pointerlockchange', () => {
        this.isPointerLocked = document.pointerLockElement === canvas;
      });
      
      // Mouse move for rotation (when pointer locked)
      canvas.addEventListener('mousemove', (e) => {
        if (this.isPointerLocked) {
          this.yaw -= e.movementX * MOUSE_SENSITIVITY;
          this.pitch += e.movementY * MOUSE_SENSITIVITY;
          this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
        }
      });
      
      // Mobile: touch swipe for rotation
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          this.lastTouchX = e.touches[0].clientX;
          this.lastTouchY = e.touches[0].clientY;
        }
      });
      
      canvas.addEventListener('touchmove', (e) => {
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
      });
    }

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

    const useFirstPerson = FIRST_PERSON && !this.debugThirdPerson;

    if (useFirstPerson) {
      // First-person: camera at eye height, look at calculated target point
      this.camera.position.x = this.target.x;
      this.camera.position.y = this.target.y + EYE_HEIGHT;
      this.camera.position.z = this.target.z;
      
      // Calculate look target using same math as third-person
      // This ensures movement direction matches look direction
      const lookDist = 10; // Short distance for look target
      const targetX = this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * lookDist;
      const targetY = this.target.y + EYE_HEIGHT - Math.sin(this.pitch) * lookDist;
      const targetZ = this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * lookDist;
      
      this.camera.setTarget(new Vector3(targetX, targetY, targetZ));
    } else {
      // Third-person: camera orbits behind player
      const targetY = this.target.y + CAMERA_TARGET_OFFSET_Y;
      
      // Spherical coordinates to cartesian
      const camX = this.target.x - Math.sin(this.yaw) * Math.cos(this.pitch) * CAMERA_DISTANCE;
      const camY = targetY + Math.sin(this.pitch) * CAMERA_DISTANCE;
      const camZ = this.target.z - Math.cos(this.yaw) * Math.cos(this.pitch) * CAMERA_DISTANCE;
      
      this.camera.position.x = camX;
      this.camera.position.y = camY;
      this.camera.position.z = camZ;
      
      // Always look at player target
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
   * Returns the camera pitch angle in radians.
   */
  getPitch(): number {
    return this.pitch;
  }

  /**
   * Get aim point by projecting 30 units from camera using manual yaw/pitch.
   * Manual calculation avoids issues with camera forward at extreme angles.
   *
   * @param myEntityId The local player entity ID (unused, kept for compatibility)
   */
  getAimPoint(myEntityId: number | null): Vector3 {
    const AIM_DISTANCE = 30; // Fixed aim distance
    
    // Calculate forward direction from yaw/pitch manually
    // In our coordinate system: +X is right, +Y is up, +Z is forward
    const dirX = Math.sin(this.yaw) * Math.cos(this.pitch);
    const dirY = -Math.sin(this.pitch);
    const dirZ = Math.cos(this.yaw) * Math.cos(this.pitch);
    
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
    // Show/hide local player mesh based on debug mode
    if (localPlayerTransform) {
      localPlayerTransform.setMeshVisibility(this.debugThirdPerson);
    }
  }

  /**
   * Check if debug third-person is active
   */
  isDebugThirdPersonActive(): boolean {
    return this.debugThirdPerson;
  }
}
