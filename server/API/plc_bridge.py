import snap7
import argparse
import json
import sys

def main():
    parser = argparse.ArgumentParser(description="Ponte de comunicação com CLP Siemens via Snap7")
    parser.add_argument('--ip', required=True, help="Endereço IP do CLP")
    parser.add_argument('--rack', type=int, default=0, help="Rack do CLP")
    parser.add_argument('--slot', type=int, default=1, help="Slot do CLP")
    parser.add_argument('--db', type=int, required=True, help="Número do Data Block (DB)")
    parser.add_argument('--start', type=int, required=True, help="Byte de início")
    parser.add_argument('--action', choices=['read', 'write'], required=True, help="Ação a ser executada")
    parser.add_argument('--value', type=int, help="Valor para escrita (byte)")
    
    args = parser.parse_args()
    client = snap7.client.Client()

    try:
        client.connect(args.ip, args.rack, args.slot)
        if not client.get_connected():
            raise Exception("Falha na conexão com o CLP.")

        if args.action == 'read':
            # Lê 1 byte do DB especificado
            data = client.db_read(args.db, args.start, 1)
            value = int.from_bytes(data, byteorder='big')
            print(json.dumps({"success": True, "value": value}))

        elif args.action == 'write':
            if args.value is None:
                raise Exception("Ação 'write' exige o parâmetro --value.")
            
            # Escreve 1 byte no DB especificado
            data = bytearray(1)
            data[0] = args.value & 0xFF
            client.db_write(args.db, args.start, data)
            print(json.dumps({"success": True, "message": "Escrita realizada com sucesso no CLP."}))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
    finally:
        if client.get_connected():
            client.disconnect()
            client.destroy()

if __name__ == "__main__":
    main()