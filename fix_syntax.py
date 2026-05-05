import os

path = 'backend/app.py'
with open(path, 'r') as f:
    content = f.read()

# Aggressive find and replace for the specific block
target = """        return jsonify({
            'success': True,
            'code': code
        })"""

replacement = """        return jsonify({
            'success': True,
            'code': code
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500"""

if target in content:
    new_content = content.replace(target, replacement)
    with open(path, 'w') as f:
        f.write(new_content)
    print("FIX APPLIED SUCCESSFULLY")
else:
    print("TARGET NOT FOUND - TRYING ALTERNATIVE")
    # Try with slightly different whitespace
    target_alt = target.replace("        ", "    ")
    if target_alt in content:
        new_content = content.replace(target_alt, replacement)
        with open(path, 'w') as f:
            f.write(new_content)
        print("FIX APPLIED SUCCESSFULLY (ALT)")
    else:
        print("CRITICAL ERROR: Could not find target block")
