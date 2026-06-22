For new Blender cars, these keys matter most:
Correct orientation+Z = car front.
+Y = upward.
+X = right side.
Car centered near world origin.
Ground and tire bottoms near Y = 0.

Separate four wheel objects
Use clear names:
wheel_front_left
wheel_front_right
wheel_rear_left
wheel_rear_right
Each wheel should contain tire and rim meshes. Wheel origin should sit exactly at hub center.
Apply transforms
Before export:
Ctrl+A → Rotation & Scale
Scale should be 1,1,1.
Rotation should be 0,0,0.
Avoid negative or mirrored scale.
Apply modifiers when appropriate.
Wheel rotation axis
Wheels currently spin around local X.
Make wheel cylinder axis run left-to-right along X. Test wheel rotation in Blender using local X.
Separate brake calipers
Name these clearly:
caliper_front_left
caliper_front_right
caliper_rear_left
caliper_rear_right
Calipers steer with front wheels but do not spin.
Material naming
Use detectable names:
car_paint
glass
windshield
rim
taillight
brake_light
This allows game paint customization, glass replacement, rim materials, and working brake lights.
Real measurements
Give me accurate values for database:
Total mass
Wheelbase
Track width
Wheel radius
Front/rear weight distribution
CoG height
Engine layout
Gear ratios
Final drive
Torque curve
Drag coefficient
Frontal area
These now affect mass dynamics, suspension, braking, tire loads, and rotation.
Engine layout
Specify one:
engineLayout: 'front'
engineLayout: 'front_mid'
engineLayout: 'mid'
engineLayout: 'rear'
For finer tuning, provide massConcentration. Lower value means mass closer to center and quicker rotation.
Avoid current Ford GT structure
Ford GT needs custom mesh-splitting code because several wheels are merged together. New models should use four clean wheel parent objects. S2000-style organization is better.
Export
Export as GLB with:
Selected objects only
Y Up
Materials included
Cameras and lights excluded
No Blender helper objects
Mesh compression optional