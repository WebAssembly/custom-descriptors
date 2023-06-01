open Al

(** Hardcoded algorithms **)

(* br *)
(* Modified DSL
   rule Step_pure/br-zero:
   ( LABEL_ n `{instr'*} val'* val^n (BR l) instr* )  ~>  val^n instr'*
   -- if l = 0
   rule Step_pure/br-succ:
   ( LABEL_ n `{instr'*} val* (BR l)) instr* )  ~>  val* (BR $(l-1))
   -- otherwise
   Note that we can safely ignore the trailing instr* because
   our Al interpreter keeps track of the point of interpretation.
*)

let br =
  Algo
    ( "execution_of_br",
      [ (NameE (N "l", []), IntT) ],
      [
        IfI
          ( CompareC (Eq, NameE (N "l", []), NumE 0L),
            (* br_zero *)
            [
              LetI (NameE (N "L", []), GetCurLabelE);
              LetI (NameE (N "n", []), ArityE (NameE (N "L", [])));
              AssertI
                "Due to validation, there are at least n values on the top of \
                 the stack"; 
              PopI (NameE (N "val", [ListN (N "n")]));
              WhileI (IsTopC "value", [ PopI (NameE (N "val'", [])) ]);
              ExitAbruptI (N "L");
              PushI (NameE (N "val", [ListN (N "n")]));
              ExecuteSeqI (ContE (NameE (N "L", [])));
            ],
            (* br_succ *)
            [
              LetI (NameE (N "L", []), GetCurLabelE);
              ExitAbruptI (N "L");
              ExecuteI
                (ConstructE ("BR", [ BinopE (Sub, NameE (N "l", []), NumE 1L) ]));
            ] );
      ] )

(* return *)
(* DSL
  rule Step_pure/return-frame:
  ( FRAME_ n `{f} val'* val^n RETURN instr* )  ~>  val^n
  rule Step_pure/return-label:
  ( LABEL_ k `{instr'*} val* RETURN instr* )  ~>  val* RETURN
  Note that WASM validation step (in the formal spec using evaluation context) 
  assures that there are 
  at least n values on the top of the stack before return.
*)

let return =
  Algo
    ( "execution_of_return",
      [],
      [
        PopAllI (NameE (N "val'", [List]));
        IfI (
          IsTopC "frame",
          (* return_frame *)
          [
            PopI (NameE (N "F", []));
            LetI (NameE (N "n", []), ArityE (NameE (N "F", [])));
            PushI (NameE (N "F", []));
            PushI (NameE (N "val'", [List]));
            PopI (NameE (N "val", [ListN (N "n")]));
            ExitAbruptI (N "F");
            PushI (NameE (N "val", [ListN (N "n")]));
          ],
          (* return_label *)
          [
            PopI (NameE (N "L", []));
            PushI (NameE (N "L", []));
            PushI (NameE (N "val'", [List]));
            ExitAbruptI (N "L");
            ExecuteI (ConstructE ("RETURN", []));
          ] );
      ] )

(* Module Semantics *)

let instantiation =
  (* Name definition *)
  let ignore_name = N "_" in
  let module_name = N "module" in
  let global_name = N "global" in
  let global_iter = NameE (global_name, [List]) in
  let elem_name = N "elem" in
  let elem_iter = NameE (elem_name, [List]) in
  let data_name = N "data" in
  let data_iter = NameE (data_name, [List]) in
  let module_inst_init_name = SubN ((N "moduleinst"), "init") in
  let module_inst_init =
    Record.empty
    |> Record.add "FUNC" (ref (ListE [||]))
    |> Record.add "TABLE" (ref (ListE [||])) in
  let frame_init_name = SubN ((N "f"), "init") in
  let frame_init_rec =
    Record.empty
    |> Record.add "MODULE" (ref (NameE (module_inst_init_name, [])))
    |> Record.add "LOCAL" (ref (ListE [||])) in
  let val_name = N "val" in
  let val_iter = NameE (val_name, [List]) in
  let ref_name = N "ref" in
  let ref_ = NameE (ref_name, [ List; List ]) in
  let module_inst_name = N "moduleinst" in
  let frame_name = N "f" in
  let frame_rec =
    Record.empty
    |> Record.add "MODULE" (ref (NameE (module_inst_name, [])))
    |> Record.add "LOCAL" (ref (ListE [||])) in
  let einit = N "einit" in
  let dinit = N "dinit" in
  let mode = N "mode" in
  let tableidx = N "tableidx" in
  let einstrs = NameE (N "einstrs", [List]) in
  let memidx = N "memidx" in
  let dinstrs = NameE (N "dinstrs", [List]) in
  let i32_type = ConstructE ("I32", []) in

  (* Algorithm *)
  Algo (
    "instantiation",
    [ (NameE (module_name, []), TopT) ],
    [
      LetI (
        ConstructE (
          "MODULE",
          [
            NameE (ignore_name, []);
            global_iter;
            NameE (ignore_name, []);
            NameE (ignore_name, []);
            elem_iter;
            data_iter
          ]
        ),
        NameE (module_name, [])
      );
      LetI (NameE (module_inst_init_name, []), RecordE module_inst_init);
      LetI (
        NameE (frame_init_name, []),
        FrameE (NumE 0L, RecordE frame_init_rec)
      );
      PushI (NameE (frame_init_name, []));
      (* Global init *)
      LetI (val_iter, MapE (N "init_global", [NameE (global_name, [])], [List]));
      (* Element init *)
      LetI (ref_, MapE (N "init_elem", [NameE (elem_name, [])], [ List ]));
      PopI (NameE (frame_init_name, []));
      (* Allocation *)
      LetI (
        NameE (module_inst_name, []),
        AppE (N "alloc_module", [NameE (module_name, []); val_iter; ref_])
      );
      LetI (NameE (frame_name, []), FrameE (NumE 0L, RecordE frame_rec));
      PushI (NameE (frame_name, []));
      (* Element *)
      ForI (
        elem_iter,
        [
          LetI (
            ConstructE ("ELEM", [ NameE (ignore_name, []); NameE (einit, []); NameE (mode, []) ]),
            AccessE (elem_iter, IndexP (NameE (N "i", [])))
          );
          (* Active Element *)
          IfI (
            BinopC (And, IsDefinedC (NameE (mode, [])), IsCaseOfC (NameE (mode, []), "TABLE")),
            [
              LetI (
                OptE (Some (ConstructE ("TABLE", [ NameE (tableidx, []); einstrs ]))),
                NameE (mode, [])
              );
              ExecuteSeqI einstrs;
              ExecuteI (ConstructE ("CONST", [ i32_type; NumE 0L ]));
              ExecuteI (ConstructE ("CONST", [ i32_type; LengthE (NameE (einit, [])) ]));
              ExecuteI (ConstructE ("TABLE.INIT", [ NameE (tableidx, []); NameE (N "i", []) ]));
              ExecuteI (ConstructE ("ELEM.DROP", [ NameE (N "i", []) ]));
            ],
            []
          );
          (* Declarative Element *)
          IfI (
            BinopC (And, IsDefinedC (NameE (mode, [])), IsCaseOfC (NameE (mode, []), "DECLARE")),
            [
              ExecuteI (ConstructE ("ELEM.DROP", [ NameE (N "i", []) ]));
            ],
            []
          )
        ]
      );
      (* Active Data *)
      ForI (
        data_iter,
        [
          LetI (
            ConstructE ("DATA", [ NameE (dinit, []); NameE (mode, []) ]),
            AccessE (data_iter, IndexP (NameE (N "i", [])))
          );
          IfI (
            IsDefinedC (NameE (mode, [])),
            [
              LetI (OptE (Some (ConstructE ("MEMORY", [ NameE (memidx, []); dinstrs ]))), NameE (mode, []));
              AssertI (CompareC (Eq, NameE (memidx, []), NumE 0L) |> Print.string_of_cond);
              ExecuteSeqI dinstrs;
              ExecuteI (ConstructE ("CONST", [ i32_type; NumE 0L ]));
              ExecuteI (ConstructE ("CONST", [ i32_type; LengthE (NameE (dinit, [])) ]));
              ExecuteI (ConstructE ("MEMORY.INIT", [ NameE (N "i", []) ]));
              ExecuteI (ConstructE ("DATA.DROP", [ NameE (N "i", []) ]));
            ],
            []
          )
        ]
      );
      (* TODO: start *)
      PopI (NameE (frame_name, []))
    ]
  )

let exec_expr =
  (* Name definition *)
  let instr_iter = NameE (N "instr", [List]) in
  let val_name = N "val" in

  (* Algorithm *)
  Algo (
    "exec_expr",
    [ instr_iter, TopT ],
    [
      JumpI instr_iter;
      PopI (NameE (val_name, []));
      ReturnI (Some (NameE (val_name, [])))
    ]
  )

let init_global =
  (* Name definition *)
  let ignore_name = N "_" in
  let global_name = N "global" in
  let instr_iter = NameE (N "instr", [List]) in
  let val_name = N "val" in

  (* Algorithm *)
  Algo (
    "init_global",
    [ NameE (global_name, []), TopT ],
    [
      LetI (
        ConstructE ("GLOBAL", [ NameE (ignore_name, []); instr_iter ]),
        NameE (global_name, [])
      );
      JumpI instr_iter;
      PopI (NameE (val_name, []));
      ReturnI (Some (NameE (val_name, [])))
    ]
  )

let init_elem =
  (* Name definition *)
  let ignore_name = N "_" in
  let elem_name = N "elem" in
  let instr_name = N "instr" in
  let instr_iter = NameE (instr_name, [List]) in
  let ref_iter = NameE (N "ref", [List]) in

  Algo (
    "init_elem",
    [ NameE (elem_name, []) , TopT ],
    [
      LetI (
        ConstructE ("ELEM", [ NameE (ignore_name, []); instr_iter; NameE (ignore_name, []) ]),
        NameE (elem_name, [])
      );
      LetI (ref_iter, MapE (N "exec_expr", [ NameE (instr_name, []) ], [ List ]));
      ReturnI (Some ref_iter)
    ]
  )

let alloc_module =
  (* Name definition *)
  let ignore_name = N "_" in
  let module_name = N "module" in
  let val_name = N "val" in
  let val_iter = NameE (val_name, [List]) in
  let ref_name = N "ref" in
  let ref_ = NameE (ref_name, [ List; List ]) in
  let func_name = N "func" in
  let func_iter = NameE (func_name, [List]) in
  let table_name = N "table" in
  let table_iter = NameE (table_name, [List]) in
  let global_name = N "global" in
  let global_iter = NameE (global_name, [List]) in
  let memory_name = N "memory" in
  let memory_iter = NameE (memory_name, [List]) in
  let elem_name = N "elem" in
  let elem_iter = NameE (elem_name, [List]) in
  let data_name = N "data" in
  let data_iter = NameE (data_name, [List]) in
  let funcaddr_iter = NameE (N "funcaddr", [List]) in
  let tableaddr_iter = NameE (N "tableaddr", [List]) in
  let globaladdr_iter = NameE (N "globaladdr", [List]) in
  let memoryaddr_iter = NameE (N "memoryaddr", [List]) in
  let elemaddr_iter = NameE (N "elemaddr", [List]) in
  let dataaddr_iter = NameE (N "dataaddr", [List]) in
  let module_inst_name = N "moduleinst" in
  let module_inst_rec =
    Record.empty
    |> Record.add "FUNC" (ref funcaddr_iter)
    |> Record.add "TABLE" (ref tableaddr_iter)
    |> Record.add "GLOBAL" (ref globaladdr_iter)
    |> Record.add "MEM" (ref memoryaddr_iter)
    |> Record.add "ELEM" (ref elemaddr_iter)
    |> Record.add "DATA" (ref dataaddr_iter)
  in
  let store_name = N "s" in
  let func_name' = N "func'" in

  let base = AccessE (NameE (N "s", []), DotP ("FUNC")) in
  let index = IndexP (NameE (N "i", [])) in
  let index_access = AccessE (base, index) in

  (* Algorithm *)
  Algo (
    "alloc_module",
    [ NameE (module_name, []), TopT; val_iter, TopT; ref_ , TopT ],
    [
      LetI (
        ConstructE (
          "MODULE",
          [
            func_iter;
            global_iter;
            table_iter;
            memory_iter;
            elem_iter;
            data_iter;
          ]
        ),
        NameE (module_name, [])
      );
      LetI (
        funcaddr_iter,
        MapE (N "alloc_func", [ NameE (func_name, []) ], [List])
      );
      LetI (
        tableaddr_iter,
        MapE (N "alloc_table", [ NameE (table_name, []) ], [List])
      );
      LetI (
        globaladdr_iter,
        MapE (N "alloc_global", [ NameE (val_name, []) ], [List])
      );
      LetI (
        memoryaddr_iter,
        MapE (N "alloc_memory", [ NameE (memory_name, []) ], [List])
      );
      LetI (
        elemaddr_iter,
        MapE (N "alloc_elem", [ NameE (ref_name, [ List ]) ], [ List ])
      );
      LetI (
        dataaddr_iter,
        MapE (N "alloc_data", [ NameE (data_name, []) ], [List])
      );
      LetI (NameE (module_inst_name, []), RecordE (module_inst_rec));
      (* TODO *)
      ForI (
        AccessE (NameE (store_name, []), DotP "FUNC"),
        [
          LetI (PairE (NameE (ignore_name, []), NameE (func_name', [])), index_access);
          ReplaceI (base, index, PairE (NameE (module_inst_name, []), NameE (func_name', [])))
        ]
      );
      ReturnI (Some (NameE (module_inst_name, [])))
    ]
  )

let alloc_func =
  (* Name definition *)
  let func_name = N "func" in
  let addr_name = N "a" in
  let store_name = N "s" in
  let dummy_module_inst = N "dummy_module_inst" in
  let dummy_module_rec =
    Record.empty
    |> Record.add "FUNC" (ref (ListE [||]))
    |> Record.add "TABLE" (ref (ListE [||])) in
  let func_inst_name = N "funcinst" in

  (* Algorithm *)
  Algo (
    "alloc_func",
    [ (NameE (func_name, []), TopT) ],
    [
      LetI (NameE (addr_name, []), LengthE (AccessE (NameE (store_name, []), DotP "FUNC")));
      LetI (NameE (dummy_module_inst, []), RecordE dummy_module_rec);
      LetI (NameE (func_inst_name, []), PairE (NameE (dummy_module_inst, []), NameE (func_name, [])));
      AppendI (NameE (func_inst_name, []), NameE (store_name, []), "FUNC");
      ReturnI (Some (NameE (addr_name, [])))
    ]
  )

let alloc_global =
  (* Name definition *)
  let val_name = N "val" in
  let addr_name = N "a" in
  let store_name = N "s" in

  (* Algorithm *)
  Algo (
    "alloc_global",
    [NameE (val_name, []), TopT],
    [
      LetI (NameE (addr_name, []), LengthE (AccessE (NameE (store_name, []), DotP "GLOBAL")));
      AppendI (NameE (val_name, []), NameE (store_name, []), "GLOBAL");
      ReturnI (Some (NameE (addr_name, [])))
    ]
  )

let alloc_table =
  (* Name definition *)
  let ignore_name = N "_" in
  let table_name = N "table" in
  let min = N "n" in
  let reftype = N "reftype" in
  let addr_name = N "a" in
  let store_name = N "s" in
  let tableinst_name = N "tableinst" in
  let ref_null = ConstructE ("REF.NULL", [NameE (reftype, [])]) in

  (* Algorithm *)
  Algo (
    "alloc_table",
    [ (NameE (table_name, []), TopT) ],
    [
      LetI (
        ConstructE ("TABLE", [PairE (NameE (min, []), NameE (ignore_name, [])); NameE (reftype, [])]),
        NameE (table_name, [])
      );
      LetI (NameE (addr_name, []), LengthE (AccessE (NameE (store_name, []), DotP "TABLE")));
      LetI (NameE (tableinst_name, []), ListFillE (ref_null, NameE (min, [])));
      AppendI (NameE (tableinst_name, []), NameE (store_name, []), "TABLE");
      ReturnI (Some (NameE (addr_name, [])))
    ]
  )

let alloc_memory =
  (* Name definition *)
  let ignore_name = N "_" in
  let memory_name = N "memory" in
  let min_name = N "min" in
  let addr_name = N "a" in
  let store_name = N "s" in
  let memoryinst_name = N "memoryinst" in

  (* Algorithm *)
  Algo(
    "alloc_memory",
    [ (NameE (memory_name, []), TopT) ],
    [
      LetI (
        ConstructE ("MEMORY", [ PairE (NameE (min_name, []), NameE (ignore_name, [])) ]),
        NameE (memory_name, [])
      );
      LetI (NameE (addr_name, []), LengthE (AccessE (NameE (store_name, []), DotP "MEM")));
      LetI (
        NameE (memoryinst_name, []),
        ListFillE (
          NumE 0L,
          BinopE (Mul, BinopE (Mul, NameE (min_name, []), NumE 64L), AppE (N "Ki", []))
        )
      );
      AppendI (NameE (memoryinst_name, []), NameE (store_name, []), "MEM");
      ReturnI (Some (NameE (addr_name, [])))
    ]
  )

let alloc_elem =
  (* Name definition *)
  let _ignore_name = N "_" in
  let ref = NameE (N "ref", [ List ]) in
  let addr_name = N "a" in
  let store_name = N "s" in

  (* Algorithm *)
  Algo (
    "alloc_elem",
    [ ref, TopT ],
    [
      LetI (NameE (addr_name, []), LengthE (AccessE (NameE (store_name, []), DotP "ELEM")));
      AppendI (ref, NameE (store_name, []), "ELEM");
      ReturnI (Some (NameE (addr_name, [])))
    ]
  )

let alloc_data =
  (* Name definition *)
  let ignore_name = N "_" in
  let data_name = N "data" in
  let init = N "init" in
  let addr_name = N "a" in
  let store_name = N "s" in

  (* Algorithm *)
  Algo (
    "alloc_data",
    [ (NameE (data_name, []), TopT) ],
    [
      LetI (
        ConstructE ("DATA", [ NameE (init, []); NameE (ignore_name, []) ]),
        NameE (data_name, [])
      );
      LetI (NameE (addr_name, []), LengthE (AccessE (NameE (store_name, []), DotP "DATA")));
      AppendI (NameE (init, []), NameE (store_name, []), "DATA");
      ReturnI (Some (NameE (addr_name, [])))
    ]
  )

let invocation =
  (* Name definition *)
  let ignore_name = N "_" in
  let args = N "val" in
  let args_iter = NameE (args, [List]) in
  let funcaddr_name = N "funcaddr" in
  let func_name = N "func" in
  let store_name = N "s" in
  let func_type_name = N "functype" in
  let n = N "n" in
  let m = N "m" in
  let frame_name = N "f" in
  let dummy_module_rec =
    Record.empty
    |> Record.add "FUNC" (ref (ListE [||]))
    |> Record.add "TABLE" (ref (ListE [||])) in
  let frame_rec =
    Record.empty
    |> Record.add "LOCAL" (ref (ListE [||]))
    |> Record.add "MODULE" (ref (RecordE dummy_module_rec)) in

  (* Algorithm *)
  Algo (
    "invocation",
    [ (NameE (funcaddr_name, []), TopT); (args_iter, TopT) ],
    [
      LetI (
        PairE (NameE (ignore_name, []), NameE (func_name, [])),
        AccessE (AccessE (NameE (store_name, []), DotP "FUNC"), IndexP (NameE (funcaddr_name, [])))
      );
      LetI (
        ConstructE ("FUNC", [NameE (func_type_name, []); NameE (ignore_name, []); NameE (ignore_name, [])]),
        NameE (func_name, [])
      );
      LetI (
        ArrowE (NameE (ignore_name, [ListN n]), NameE (ignore_name, [ListN m])),
        NameE (func_type_name, [])
      );
      AssertI (CompareC (Eq, LengthE args_iter, NameE (n, [])) |> Print.string_of_cond);
      (* TODO *)
      LetI (NameE (frame_name, []), FrameE (NumE 0L, RecordE frame_rec));
      PushI (NameE (frame_name, []));
      PushI (args_iter);
      ExecuteI (ConstructE ("CALL_ADDR", [NameE (funcaddr_name, [])]));
      PopI (NameE (SubN (N "val", "res"), [ListN m]));
      PopI (NameE (frame_name, []));
      ReturnI (Some (NameE (SubN (N "val", "res"), [ListN m])))
    ]
  )


let manual_algos =
  [
    br;
    return;
    instantiation;
    exec_expr;
    init_global;
    init_elem;
    alloc_module;
    alloc_func;
    alloc_global;
    alloc_table;
    alloc_memory;
    alloc_elem;
    alloc_data;
    invocation
  ]
