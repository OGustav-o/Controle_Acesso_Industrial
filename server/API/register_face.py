import requests
from requests.auth import HTTPDigestAuth
import argparse
import json
import sys
import base64
import time
from PIL import Image
from io import BytesIO


# ==========================================================
# UTIL: RETORNO PADRÃO
# ==========================================================
def fail(msg):
    print(json.dumps({"success": False, "error": msg}))
    sys.exit(1)

def ok(msg):
    print(json.dumps({"success": True, "message": msg}))
    sys.exit(0)


# ==========================================================
# UTIL: AJUSTA FOTO PARA PADRÃO INTELBRAS
# ==========================================================
def prepare_image(image_path):
    try:
        img = Image.open(image_path).convert("RGB")

        max_width = 400
        max_height = 600

        img.thumbnail((max_width, max_height))

        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=82)

        img_bytes = buffer.getvalue()
        img_base64 = base64.b64encode(img_bytes).decode("utf-8")

        return img_base64

    except Exception as e:
        fail(f"Erro ao preparar imagem: {str(e)}")


# ==========================================================
# CADASTRA USUÁRIO
# ==========================================================
def create_user(ip, auth, user_id, user_name):
    user_payload = {
        "UserList": [{
            "UserID": str(user_id),
            "UserName": str(user_name),
            "UserType": 0,
            "Authority": 2,
            "Password": "",
            "Doors": [0],
            "TimeSections": [255],
            "ValidFrom": "2020-01-01 00:00:00",
            "ValidTo": "2037-12-31 23:59:59"
        }]
    }

    url = f"http://{ip}/cgi-bin/AccessUser.cgi?action=insertMulti"

    try:
        r = requests.post(url, json=user_payload, auth=auth, timeout=10)

        if r.status_code != 200:
            fail(f"Falha ao criar usuário: HTTP {r.status_code} | {r.text}")

        return True

    except Exception as e:
        fail(f"Erro ao cadastrar usuário: {str(e)}")


# ==========================================================
# MÉTODO 1 - FACEINFOMANAGER
# ==========================================================
def add_face_method1(ip, auth, user_id, user_name, img_base64):
    url = f"http://{ip}/cgi-bin/FaceInfoManager.cgi?action=add"

    payload = {
        "UserID": str(user_id),
        "Info": {
            "UserName": str(user_name),
            "PhotoData": [img_base64]
        }
    }

    try:
        r = requests.post(
            url,
            data=json.dumps(payload),
            headers={"Content-Type": "application/json"},
            auth=auth,
            timeout=20
        )

        if r.status_code == 200:
            return True, "FaceInfoManager OK"

        return False, f"FaceInfoManager rejeitou: HTTP {r.status_code} | {r.text}"

    except Exception as e:
        return False, str(e)


# ==========================================================
# MÉTODO 2 - RECORDUPDATER FALLBACK
# ==========================================================
def add_face_method2(ip, auth, user_id, user_name, img_base64):
    url = f"http://{ip}/cgi-bin/recordUpdater.cgi?action=insert"

    payload = {
        "table": "FaceInfo",
        "record": {
            "UserID": str(user_id),
            "UserName": str(user_name),
            "PhotoData": img_base64
        }
    }

    try:
        r = requests.post(
            url,
            data=json.dumps(payload),
            headers={"Content-Type": "application/json"},
            auth=auth,
            timeout=20
        )

        if r.status_code == 200:
            return True, "recordUpdater OK"

        return False, f"recordUpdater rejeitou: HTTP {r.status_code} | {r.text}"

    except Exception as e:
        return False, str(e)


# ==========================================================
# FLUXO UNIVERSAL
# ==========================================================
def register_user_and_face(ip, user, pwd, user_id, user_name, image_path):
    auth = HTTPDigestAuth(user, pwd)

    # 1 - CADASTRA USUÁRIO
    create_user(ip, auth, user_id, user_name)

    # 2 - ESPERA PERSISTÊNCIA INTERNA
    time.sleep(1.5)

    # 3 - PREPARA FOTO
    img_base64 = prepare_image(image_path)

    # 4 - TENTA MÉTODO 1
    for tentativa in range(2):
        status, msg = add_face_method1(ip, auth, user_id, user_name, img_base64)
        if status:
            ok(f"Usuário cadastrado com sucesso via {msg}")
        time.sleep(1)

    # 5 - FALLBACK MÉTODO 2
    for tentativa in range(2):
        status, msg = add_face_method2(ip, auth, user_id, user_name, img_base64)
        if status:
            ok(f"Usuário cadastrado com sucesso via {msg}")
        time.sleep(1)

    fail(f"Nenhum método de cadastro facial aceito pela máquina.")


# ==========================================================
# MAIN
# ==========================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--ip', required=True)
    parser.add_argument('--user', required=True)
    parser.add_argument('--password', required=True)
    parser.add_argument('--userid', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--image', required=True)

    args = parser.parse_args()

    register_user_and_face(
        args.ip,
        args.user,
        args.password,
        args.userid,
        args.name,
        args.image
    )