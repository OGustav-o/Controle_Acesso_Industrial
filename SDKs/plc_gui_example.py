import snap7
from snap7.util import *
#from snap7.snap7types import *
import FreeSimpleGUI as sg
import struct

# --- Configurações do CLP ---
# ATENÇÃO: Substitua estes valores pelos dados reais do seu CLP
PLC_IP = '192.168.0.1'  # Endereço IP do seu CLP
RACK = 0                # Rack do CLP (geralmente 0)
SLOT = 1                # Slot do CLP (geralmente 1 para S7-1500, 2 para S7-1200)
DB_NUMBER = 100         # Número do Data Block (DB) a ser usado
DB_SIZE = 100           # Tamanho do DB em bytes (deve ser grande o suficiente para os dados)

# --- Definições de Endereços no DB (Exemplo) ---
# Estes endereços são relativos ao início do DB (DB1.DBX0.0)
ADDR_BOOL = 0, 0    # DB1.DBX0.0 (Byte 0, Bit 0)
ADDR_INT = 2        # DB1.DBW2 (Word 2)
ADDR_REAL = 4       # DB1.DBD4 (Double Word 4)
ADDR_STRING = 8     # DB1.DBB8 (Início da String, 2 bytes de cabeçalho + 20 bytes de dados = 22 bytes)
STRING_MAX_LEN = 20 # Tamanho máximo da string (excluindo cabeçalho)

# --- Funções de Comunicação com o CLP ---

def connect_plc(client):
    """Tenta conectar ao CLP."""
    try:
        client.connect(PLC_IP, RACK, SLOT)
        return client.get_connected()
    except Exception as e:
        print(f"Erro de conexão: {e}")
        return False

def read_db(client, db_num, start_addr, size):
    """Lê um bloco de bytes do DB."""
    try:
        return client.db_read(db_num, start_addr, size)
    except Exception as e:
        print(f"Erro ao ler DB: {e}")
        return None

def write_db(client, db_num, start_addr, data):
    """Escreve um bloco de bytes no DB."""
    try:
        client.db_write(db_num, start_addr, data)
        return True
    except Exception as e:
        print(f"Erro ao escrever DB: {e}")
        return False

# --- Funções de Leitura e Escrita de Tipos de Dados Específicos ---

def read_data_types(client):
    """Lê todos os tipos de dados do DB."""
    
    # Leitura de um bloco de bytes que cobre todos os endereços
    # O bloco deve ser grande o suficiente para cobrir o último endereço (String em 8) + seu tamanho (22)
    # 8 + 22 = 30 bytes. Vamos ler 35 bytes para garantir.
    data = read_db(client, DB_NUMBER, 0, 35)
    if data is None:
        return None

    results = {}
    
    # 1. BOOL (DBX0.0)
    # O byte 0 contém o bit 0
    results['bool'] = get_bool(data, ADDR_BOOL[0], ADDR_BOOL[1])
    
    # 2. INT (DBW2)
    results['int'] = get_int(data, ADDR_INT)
    
    # 3. REAL (DBD4)
    results['real'] = get_real(data, ADDR_REAL)
    
    # 4. STRING (DBB8)
    # A função get_string espera o byte array, o offset e o tamanho máximo da string
    results['string'] = get_string(data, ADDR_STRING)
    
    return results

def write_data_types(client, bool_val, int_val, real_val, string_val):
    """Escreve todos os tipos de dados no DB."""
    
    # Cria um buffer de bytes para a escrita
    # O buffer deve ser grande o suficiente para cobrir o último endereço (String em 8) + seu tamanho (22)
    # 8 + 22 = 30 bytes. Vamos usar 35 bytes para garantir.
    data = bytearray(35)
    
    # 1. BOOL (DBX0.0)
    set_bool(data, ADDR_BOOL[0], ADDR_BOOL[1], bool_val)
    
    # 2. INT (DBW2)
    set_int(data, ADDR_INT, int_val)
    
    # 3. REAL (DBD4)
    set_real(data, ADDR_REAL, real_val)
    
    # 4. STRING (DBB8)
    set_string(data, ADDR_STRING, string_val, STRING_MAX_LEN)
    
    # Escreve o bloco de bytes no CLP
    return write_db(client, DB_NUMBER, 0, data)

# --- Layout da Interface Gráfica (PySimpleGUI) ---

sg.theme('LightBlue')

layout = [
    [sg.Text('Configuração do CLP:', font=('Helvetica', 12, 'bold'))],
    [sg.Text('IP:', size=(10, 1)), sg.InputText(PLC_IP, key='-IP-', size=(15, 1)),
     sg.Text('Rack:', size=(5, 1)), sg.InputText(RACK, key='-RACK-', size=(5, 1)),
     sg.Text('Slot:', size=(5, 1)), sg.InputText(SLOT, key='-SLOT-', size=(5, 1)),
     sg.Button('Conectar', key='-CONNECT-')],
    [sg.Text('Status:', size=(10, 1)), sg.Text('Desconectado', size=(15, 1), key='-STATUS-', text_color='red')],
    
    [sg.HSeparator()],
    
    [sg.Text(f'DB de Teste: DB{DB_NUMBER}', font=('Helvetica', 12, 'bold'))],
    
    # BOOL
    [sg.Text('BOOL (DBX0.0):', size=(15, 1)), 
     sg.Checkbox('Valor a Escrever', key='-WRITE_BOOL-', default=False),
     sg.Button('Escrever BOOL', key='-WRITE_BOOL_BTN-'),
     sg.Text('Lido:', size=(5, 1)), sg.Text('---', key='-READ_BOOL-', size=(10, 1))],
     
    # INT
    [sg.Text('INT (DBW2):', size=(15, 1)), 
     sg.InputText('123', key='-WRITE_INT-', size=(15, 1)),
     sg.Button('Escrever INT', key='-WRITE_INT_BTN-'),
     sg.Text('Lido:', size=(5, 1)), sg.Text('---', key='-READ_INT-', size=(10, 1))],
     
    # REAL
    [sg.Text('REAL (DBD4):', size=(15, 1)), 
     sg.InputText('3.14', key='-WRITE_REAL-', size=(15, 1)),
     sg.Button('Escrever REAL', key='-WRITE_REAL_BTN-'),
     sg.Text('Lido:', size=(5, 1)), sg.Text('---', key='-READ_REAL-', size=(10, 1))],
     
    # STRING
    [sg.Text(f'STRING (DBB8, Max {STRING_MAX_LEN}):', size=(15, 1)), 
     sg.InputText('Teste Snap7', key='-WRITE_STRING-', size=(20, 1)),
     sg.Button('Escrever STRING', key='-WRITE_STRING_BTN-'),
     sg.Text('Lido:', size=(5, 1)), sg.Text('---', key='-READ_STRING-', size=(20, 1))],
     
    [sg.HSeparator()],
    
    [sg.Button('Ler Todos', key='-READ_ALL-'), sg.Button('Escrever Todos', key='-WRITE_ALL-'), sg.Button('Sair')]
]

window = sg.Window('Snap7/PySimpleGUI CLP Tester', layout, finalize=True)

# --- Loop Principal da Aplicação ---

plc = snap7.client.Client()
is_connected = False

def update_status(connected):
    """Atualiza o status de conexão na GUI."""
    global is_connected
    is_connected = connected
    if connected:
        window['-STATUS-'].update('Conectado', text_color='green')
    else:
        window['-STATUS-'].update('Desconectado', text_color='red')

def read_and_update_gui():
    """Lê todos os dados do CLP e atualiza a GUI."""
    if not is_connected:
        sg.popup_error('Erro: Não conectado ao CLP.')
        return
        
    results = read_data_types(plc)
    if results:
        window['-READ_BOOL-'].update(results['bool'])
        window['-READ_INT-'].update(results['int'])
        window['-READ_REAL-'].update(f"{results['real']:.2f}")
        window['-READ_STRING-'].update(results['string'])
        sg.popup_quick_message('Leitura concluída com sucesso!', background_color='green', text_color='white', font=('Helvetica', 10))
    else:
        sg.popup_error('Erro ao ler dados do CLP.')

while True:
    event, values = window.read()
    
    if event == sg.WIN_CLOSED or event == 'Sair':
        break
        
    if event == '-CONNECT-':
        # Atualiza as configurações com os valores da GUI
        try:
            PLC_IP = values['-IP-']
            RACK = int(values['-RACK-'])
            SLOT = int(values['-SLOT-'])
        except ValueError:
            sg.popup_error('Rack e Slot devem ser números inteiros.')
            continue
            
        if connect_plc(plc):
            update_status(True)
            sg.popup_quick_message('Conexão estabelecida!', background_color='green', text_color='white', font=('Helvetica', 10))
        else:
            update_status(False)
            sg.popup_error('Falha na conexão. Verifique o IP, Rack, Slot e se o CLP está acessível.')

    if is_connected:
        
        # --- Leitura de Todos os Dados ---
        if event == '-READ_ALL-':
            read_and_update_gui()
            
        # --- Escrita de Dados ---
        
        # Função auxiliar para escrita
        def write_single_data(data_type, value):
            try:
                # Tenta converter o valor para o tipo correto
                if data_type == 'int':
                    val = int(value)
                elif data_type == 'real':
                    val = float(value)
                elif data_type == 'bool':
                    val = value # Já é booleano do checkbox
                elif data_type == 'string':
                    val = value
                else:
                    return False

                # Lê os valores atuais para garantir que apenas o valor desejado seja alterado
                current_values = read_data_types(plc)
                if not current_values:
                    sg.popup_error(f'Erro ao ler valores atuais para escrita de {data_type}.')
                    return False
                
                # Atualiza o valor a ser escrito
                if data_type == 'bool':
                    bool_val = val
                    int_val = current_values['int']
                    real_val = current_values['real']
                    string_val = current_values['string']
                elif data_type == 'int':
                    bool_val = current_values['bool']
                    int_val = val
                    real_val = current_values['real']
                    string_val = current_values['string']
                elif data_type == 'real':
                    bool_val = current_values['bool']
                    int_val = current_values['int']
                    real_val = val
                    string_val = current_values['string']
                elif data_type == 'string':
                    bool_val = current_values['bool']
                    int_val = current_values['int']
                    real_val = current_values['real']
                    string_val = val
                
                # Escreve o bloco completo
                if write_data_types(plc, bool_val, int_val, real_val, string_val):
                    sg.popup_quick_message(f'{data_type.upper()} escrito com sucesso!', background_color='green', text_color='white', font=('Helvetica', 10))
                    read_and_update_gui() # Lê e atualiza a GUI após a escrita
                else:
                    sg.popup_error(f'Falha ao escrever {data_type.upper()}.')
                    
            except ValueError:
                sg.popup_error(f'Valor inválido para {data_type.upper()}.')
            except Exception as e:
                sg.popup_error(f'Erro inesperado ao escrever {data_type.upper()}: {e}')

        if event == '-WRITE_BOOL_BTN-':
            write_single_data('bool', values['-WRITE_BOOL-'])
            
        elif event == '-WRITE_INT_BTN-':
            write_single_data('int', values['-WRITE_INT-'])
            
        elif event == '-WRITE_REAL_BTN-':
            write_single_data('real', values['-WRITE_REAL-'])
            
        elif event == '-WRITE_STRING_BTN-':
            write_single_data('string', values['-WRITE_STRING-'])
            
        elif event == '-WRITE_ALL-':
            try:
                bool_val = values['-WRITE_BOOL-']
                int_val = int(values['-WRITE_INT-'])
                real_val = float(values['-WRITE_REAL-'])
                string_val = values['-WRITE_STRING-']
                
                if write_data_types(plc, bool_val, int_val, real_val, string_val):
                    sg.popup_quick_message('Todos os dados escritos com sucesso!', background_color='green', text_color='white', font=('Helvetica', 10))
                    read_and_update_gui() # Lê e atualiza a GUI após a escrita
                else:
                    sg.popup_error('Falha ao escrever todos os dados.')
                    
            except ValueError:
                sg.popup_error('Um ou mais valores de entrada são inválidos.')
            except Exception as e:
                sg.popup_error(f'Erro inesperado ao escrever todos os dados: {e}')
                
    else:
        # Mensagem de erro se tentar operar sem conexão
        if event in ['-READ_ALL-', '-WRITE_BOOL_BTN-', '-WRITE_INT_BTN-', '-WRITE_REAL_BTN-', '-WRITE_STRING_BTN-', '-WRITE_ALL-']:
            sg.popup_error('Erro: Não conectado ao CLP. Clique em "Conectar" primeiro.')

# --- Finalização ---
if plc.get_connected():
    plc.disconnect()
window.close()

# --- Instruções de Uso (Comentário no final do arquivo) ---
# INSTRUÇÕES DE USO:
# 1. Certifique-se de que o CLP (S7-1500/1200) está configurado para permitir acesso PUT/GET.
# 2. Crie um Data Block (DB) no seu projeto TIA Portal com o número (DB1) e tamanho (mínimo 30 bytes) especificados.
# 3. Desative a otimização de acesso ao bloco (Optimization Block Access) para o DB de teste.
# 4. Defina as variáveis no DB de acordo com os offsets usados no código:
#    - BOOL: DB1.DBX0.0
#    - INT: DB1.DBW2
#    - REAL: DB1.DBD4
#    - STRING: DB1.DBB8 (com tamanho máximo de 20 caracteres)
# 5. Substitua o PLC_IP, RACK e SLOT no código pelas configurações do seu CLP.
# 6. Execute o script Python.
# 7. Clique em "Conectar" e depois em "Ler Todos" ou nos botões de escrita.
#
# OBSERVAÇÃO SOBRE ESCRITA INDIVIDUAL:
# As funções de escrita individual (e.g., Escrever BOOL) leem primeiro todos os dados, 
# alteram apenas o valor desejado no buffer e depois escrevem o bloco completo de volta. 
# Isso é necessário porque a comunicação snap7 é baseada em blocos de bytes.
