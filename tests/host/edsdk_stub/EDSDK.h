// Só para o teste automático no Linux (tests/host): os poucos nomes de tipo que os cabeçalhos do app citam, para
// compilar sem câmeras. Não é o SDK da Canon (nada dele está aqui) e nada disto entra no app de verdade.
#pragma once
typedef unsigned int EdsUInt32;
typedef int EdsInt32;
typedef unsigned int EdsError;
typedef unsigned int EdsObjectEvent;
typedef void EdsVoid;
typedef struct __EdsObject* EdsBaseRef;
typedef EdsBaseRef EdsCameraRef;
#define EDSCALLBACK
#define EDS_ERR_OK 0x00000000
#define EDS_ERR_DEVICE_BUSY 0x00000081
